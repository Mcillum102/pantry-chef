-- 消息自动清理：每个家庭只保留最新 50 条消息（首页只显示最新 20 条），发新消息时删掉更早的。
-- 只删超出 50 条的旧消息，不影响提醒本身（reminders 表）。可重复执行。
-- 回滚见 supabase/rollback/20261118010000_nudges_auto_trim_down.sql。

create index if not exists nudges_household_created_idx on public.nudges(household_id, created_at desc);

create or replace function private.trim_nudges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.nudges
  where household_id = new.household_id
    and id not in (
      select id from public.nudges
      where household_id = new.household_id
      order by created_at desc
      limit 50
    );
  return null;
end;
$$;

revoke all on function private.trim_nudges() from public, anon, authenticated;

drop trigger if exists nudges_trim on public.nudges;
create trigger nudges_trim
after insert on public.nudges
for each row execute function private.trim_nudges();
