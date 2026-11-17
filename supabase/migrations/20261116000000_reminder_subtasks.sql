-- 提醒的子任务
--
-- reminders.subtasks             子任务列表 [{ "id": "...", "title": "..." }]，跟着提醒一起保存
-- reminder_subtask_checks        子任务的勾选记录；重复提醒按「哪一天」分别记录，和 reminder_completions 一样
--
-- 只新增对象，不改旧数据。可重复执行。回滚见 supabase/rollback/20261116000000_reminder_subtasks_down.sql。

alter table public.reminders
  add column if not exists subtasks jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reminders_subtasks_is_array'
  ) then
    alter table public.reminders
      add constraint reminders_subtasks_is_array
      check (jsonb_typeof(subtasks) = 'array' and jsonb_array_length(subtasks) <= 20);
  end if;
end;
$$;

create table if not exists public.reminder_subtask_checks (
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  subtask_id text not null check (char_length(subtask_id) between 1 and 64),
  occurrence_date date not null,
  done_by text not null check (done_by in ('a', 'b')),
  done_at timestamptz not null default now(),
  primary key (reminder_id, subtask_id, occurrence_date)
);

create index if not exists reminder_subtask_checks_household_idx
  on public.reminder_subtask_checks(household_id, occurrence_date);

alter table public.reminder_subtask_checks enable row level security;

drop policy if exists "reminder_subtask_checks_all" on public.reminder_subtask_checks;
create policy "reminder_subtask_checks_all" on public.reminder_subtask_checks for all to authenticated
using ((select private.is_household_member(household_id)))
with check ((select private.is_household_member(household_id)));

revoke all on public.reminder_subtask_checks from anon;
grant select, insert, update, delete on public.reminder_subtask_checks to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reminder_subtask_checks'
  ) then
    alter publication supabase_realtime add table public.reminder_subtask_checks;
  end if;
end;
$$;
