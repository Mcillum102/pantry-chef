-- App 开着的设备不推送
--
-- push_subscriptions.active_until  App 在前台时每 30 秒更新成「现在 + 45 秒」，切到后台时清空。
-- Edge Function「push」发通知时跳过 active_until 还没过期的设备（人正在 App 里，不需要再弹通知）。
--
-- 只加一列，不改数据。可重复执行。回滚见 supabase/rollback/20261120000000_push_active_until_down.sql。
-- 没执行之前一切照旧（App 开着也会收到推送）。

alter table public.push_subscriptions add column if not exists active_until timestamptz;
