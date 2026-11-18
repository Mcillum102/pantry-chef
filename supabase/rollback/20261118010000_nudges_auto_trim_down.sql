-- 撤销 20261118010000_nudges_auto_trim.sql（已经被自动删除的旧消息无法恢复）
drop trigger if exists nudges_trim on public.nudges;
drop function if exists private.trim_nudges();
drop index if exists public.nudges_household_created_idx;
