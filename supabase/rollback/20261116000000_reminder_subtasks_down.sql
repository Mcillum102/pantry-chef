-- 回滚 20261116000000_reminder_subtasks.sql：删除子任务勾选表和 reminders.subtasks 列。
-- 注意：会丢失所有子任务内容和勾选记录；提醒本身不受影响。

drop table if exists public.reminder_subtask_checks;
alter table public.reminders drop constraint if exists reminders_subtasks_is_array;
alter table public.reminders drop column if exists subtasks;
