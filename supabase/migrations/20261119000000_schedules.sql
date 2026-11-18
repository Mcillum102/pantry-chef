-- 日程 + 单独设置提醒 + 更多重复方式
--
-- reminders.kind           task 待办（要勾选完成）/ event 日程（演唱会、生日、看医生，不用勾选）
-- reminders.remind_before  提前多少分钟推送通知；null 不推送。全天的按当天 09:00 算（1440 = 前一天 09:00）
-- reminders.repeat         新增 weekdays（工作日）、yearly（每年，生日 / 纪念日）
--
-- 升级前的规则是「有时间就准时推送」，所以第一次加 remind_before 列时，把有时间的提醒设成 0（准时），行为不变。
-- 只加列和放宽约束，不删数据。可重复执行。回滚见 supabase/rollback/20261119000000_schedules_down.sql。

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reminders' and column_name = 'remind_before'
  ) then
    alter table public.reminders add column remind_before integer;
    update public.reminders set remind_before = 0 where due_time is not null;
  end if;
end;
$$;

alter table public.reminders add column if not exists kind text not null default 'task';

alter table public.reminders drop constraint if exists reminders_kind_check;
alter table public.reminders add constraint reminders_kind_check check (kind in ('task', 'event'));

alter table public.reminders drop constraint if exists reminders_remind_before_check;
alter table public.reminders add constraint reminders_remind_before_check
  check (remind_before is null or remind_before between 0 and 43200);

alter table public.reminders drop constraint if exists reminders_repeat_check;
alter table public.reminders add constraint reminders_repeat_check
  check (repeat in ('none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'));

-- 每分钟的推送检查：以前只看有时间的提醒，现在看设了提醒的（全天的日程也能推送）
create or replace function private.push_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.push_subscriptions)
     and exists (select 1 from public.reminders where remind_before is not null) then
    perform private.push_post(jsonb_build_object('type', 'tick'));
  end if;
end;
$$;

revoke all on function private.push_tick() from public, anon, authenticated;
