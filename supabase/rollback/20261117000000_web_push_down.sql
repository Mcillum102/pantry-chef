-- 回滚 20261117000000_web_push.sql：停掉推送，删除推送相关的表和函数。
-- 会删除所有设备的通知订阅和推送密钥（之后重新开启需要每台手机再点一次「开启通知」）。
-- 提醒、消息等数据不受影响。pg_net / pg_cron 扩展保留（可能还有别的用途）。
-- Edge Function「push」需要在 Supabase 后台 Edge Functions 页面手动删除。

do $$
begin
  if exists (select 1 from cron.job where jobname = 'push-due-reminders') then
    perform cron.unschedule('push-due-reminders');
  end if;
end;
$$;

drop trigger if exists nudges_push on public.nudges;
drop function if exists private.push_on_nudge();
drop function if exists private.push_tick();
drop function if exists private.push_post(jsonb);
drop table if exists public.push_deliveries;
drop table if exists public.push_subscriptions;
drop table if exists public.push_config;
