-- 撤销 20261118000000_push_service_role_grants.sql（撤销后推送会停止工作）
revoke select, insert, update, delete on public.push_config, public.push_subscriptions, public.push_deliveries from service_role;
revoke select on public.nudges, public.reminders, public.reminder_completions, public.household_members from service_role;
