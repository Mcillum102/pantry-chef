-- 撤销 20261119000000_schedules.sql
-- 注意：日程会变回普通待办；「每年 / 工作日」重复的提醒要先改掉或删掉，否则恢复旧约束会失败。
-- 回滚后要同时把 Edge Function「push」换回旧版本（旧版本按 due_time 推送）。

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

revoke all on function private.push_tick() from public, anon, authenticated;

alter table public.reminders drop constraint if exists reminders_repeat_check;
alter table public.reminders add constraint reminders_repeat_check
  check (repeat in ('none', 'daily', 'weekly', 'monthly'));

alter table public.reminders drop constraint if exists reminders_remind_before_check;
alter table public.reminders drop constraint if exists reminders_kind_check;
alter table public.reminders drop column if exists remind_before;
alter table public.reminders drop column if exists kind;
