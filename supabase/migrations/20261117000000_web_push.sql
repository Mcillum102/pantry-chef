-- iPhone 推送（Web Push，主屏幕 App）
--
-- push_subscriptions  每台开启了通知的设备一行（属于哪个家庭、哪个人、推送地址、时区）
-- push_deliveries     到点提醒的发送记录，保证同一条提醒同一天只推一次
-- push_config         推送用的密钥和设置，只有服务端能读写（App 读不到）
--
-- 有新消息时，触发器通知 Edge Function「push」；pg_cron 每分钟让它检查一次到点的提醒。
-- 只新增对象，不改旧数据。可重复执行。回滚见 supabase/rollback/20261117000000_web_push_down.sql。
--
-- 执行后还要做一步（每个 Supabase 项目不同）：
--   insert into public.push_config(key, value)
--   values ('function_url', 'https://<project-ref>.supabase.co/functions/v1/push')
--   on conflict (key) do update set value = excluded.value;

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member text not null check (member in ('a', 'b')),
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 40 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  timezone text not null default 'America/Vancouver' check (char_length(timezone) <= 64),
  user_agent text not null default '' check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz
);

create index if not exists push_subscriptions_member_idx on public.push_subscriptions(household_id, member);

drop trigger if exists push_subscriptions_touch_updated_at on public.push_subscriptions;
create trigger push_subscriptions_touch_updated_at
before update on public.push_subscriptions
for each row execute function private.touch_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_all" on public.push_subscriptions;
create policy "push_subscriptions_all" on public.push_subscriptions for all to authenticated
using ((select private.is_household_member(household_id)))
with check ((select private.is_household_member(household_id)));

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create table if not exists public.push_deliveries (
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  occurrence_date date not null,
  member text not null check (member in ('a', 'b')),
  sent_at timestamptz not null default now(),
  primary key (reminder_id, occurrence_date, member)
);

-- 只给服务端用：开启 RLS 且不建任何策略，App（anon / authenticated）读写不了
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;

create table if not exists public.push_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

-- 数据库和 Edge Function 之间的暗号，在数据库里随机生成，不经过任何人手
insert into public.push_config(key, value)
values ('webhook_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

-- 调用 Edge Function（异步，不阻塞写入）
create or replace function private.push_post(p_body jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from public.push_config where key = 'function_url';
  select value into v_secret from public.push_config where key = 'webhook_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 10000
  );
end;
$$;

-- 新消息 → 推给对方。推送出任何问题都不能影响消息本身发出去
create or replace function private.push_on_nudge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.push_post(jsonb_build_object('type', 'nudge', 'nudgeId', new.id));
  exception when others then
    raise warning 'push_on_nudge failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists nudges_push on public.nudges;
create trigger nudges_push
after insert on public.nudges
for each row execute function private.push_on_nudge();

-- 每分钟：有开了通知的设备、也有设了时间的提醒时才去叫 Edge Function
create or replace function private.push_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.push_subscriptions)
     and exists (select 1 from public.reminders where due_time is not null) then
    perform private.push_post(jsonb_build_object('type', 'tick'));
  end if;
end;
$$;

revoke all on function private.push_post(jsonb) from public, anon, authenticated;
revoke all on function private.push_on_nudge() from public, anon, authenticated;
revoke all on function private.push_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'push-due-reminders') then
    perform cron.unschedule('push-due-reminders');
  end if;
  perform cron.schedule('push-due-reminders', '* * * * *', 'select private.push_tick()');
end;
$$;
