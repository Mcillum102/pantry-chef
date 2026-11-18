-- 撤销 20261120000000_push_active_until.sql（之后 App 开着时也会收到推送）
alter table public.push_subscriptions drop column if exists active_until;
