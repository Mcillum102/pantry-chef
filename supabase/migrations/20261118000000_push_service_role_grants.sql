-- Edge Function「push」用 service_role 读写数据库。
-- 这个项目的 public 表没有默认授权给 service_role（RLS 能绕过，表权限绕不过），
-- 不授权时函数一律返回 internal-error，App 里「开启通知」显示「没成功」。
-- 只加授权，不改数据。可重复执行。回滚见 supabase/rollback/20261118000000_push_service_role_grants_down.sql。

grant usage on schema public to service_role;
grant select, insert, update, delete on public.push_config, public.push_subscriptions, public.push_deliveries to service_role;
grant select on public.nudges, public.reminders, public.reminder_completions, public.household_members to service_role;
