-- 提醒（日历 + 待办）和「催一下」消息
--
-- reminders            一条提醒；可以重复（每天 / 每周 / 每月），指定给丁丁(a)、小林(b)或两人一起(both)
-- reminder_completions 重复提醒按「哪一天」分别完成，互不影响
-- nudges               「催一下」：一个人发给另一个人的提醒消息，对方设备通过 Realtime 立刻收到
--
-- 两人共用一个 Supabase 账号，所以「谁」用成员编号 a / b 表示，权限按家庭划分。
-- 只新增对象，不改旧表。可重复执行。回滚见 supabase/rollback/20261115000000_reminders_and_nudges_down.sql。

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  emoji text not null default '📌',
  notes text not null default '',
  due_date date not null,
  due_time text check (due_time is null or due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly', 'monthly')),
  assignee text not null default 'both' check (assignee in ('a', 'b', 'both')),
  created_by text not null check (created_by in ('a', 'b')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reminders_household_idx on public.reminders(household_id, due_date);

create table if not exists public.reminder_completions (
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  occurrence_date date not null,
  done_by text not null check (done_by in ('a', 'b')),
  done_at timestamptz not null default now(),
  primary key (reminder_id, occurrence_date)
);

create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  reminder_id uuid references public.reminders(id) on delete set null,
  from_member text not null check (from_member in ('a', 'b')),
  to_member text not null check (to_member in ('a', 'b')),
  message text not null check (char_length(trim(message)) between 1 and 200),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists nudges_inbox_idx on public.nudges(household_id, to_member, created_at desc);

-- updated_at 自动更新
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reminders_touch_updated_at on public.reminders;
create trigger reminders_touch_updated_at
before update on public.reminders
for each row execute function private.touch_updated_at();

-- 权限：只有本家庭（白名单内）的账号能读写
alter table public.reminders enable row level security;
alter table public.reminder_completions enable row level security;
alter table public.nudges enable row level security;

drop policy if exists "reminders_all" on public.reminders;
create policy "reminders_all" on public.reminders for all to authenticated
using ((select private.is_household_member(household_id)))
with check ((select private.is_household_member(household_id)));

drop policy if exists "reminder_completions_all" on public.reminder_completions;
create policy "reminder_completions_all" on public.reminder_completions for all to authenticated
using ((select private.is_household_member(household_id)))
with check ((select private.is_household_member(household_id)));

drop policy if exists "nudges_all" on public.nudges;
create policy "nudges_all" on public.nudges for all to authenticated
using ((select private.is_household_member(household_id)))
with check ((select private.is_household_member(household_id)));

revoke all on public.reminders, public.reminder_completions, public.nudges from anon;
grant select, insert, update, delete on public.reminders, public.reminder_completions, public.nudges to authenticated;

-- Realtime：两台手机实时看到对方的改动和「催一下」
do $$
declare
  t text;
begin
  foreach t in array array['reminders', 'reminder_completions', 'nudges'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
