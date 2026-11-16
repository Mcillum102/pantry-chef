-- 回滚 20261115000000_reminders_and_nudges：删除提醒和「催一下」相关的表（数据会一起删除）

do $$
declare
  t text;
begin
  foreach t in array array['nudges', 'reminder_completions', 'reminders'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end;
$$;

drop table if exists public.nudges;
drop table if exists public.reminder_completions;
drop table if exists public.reminders;
drop function if exists private.touch_updated_at();
