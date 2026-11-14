-- 删除 Supabase 账号时，不再连带删除厨房数据
--
-- 之前 households.owner_id / household_snapshots.owner_id 都是 on delete cascade：
-- 在 Authentication → Users 删掉建厨房的那个账号，整个厨房和快照会一起被删。
-- 改成 on delete set null：账号删了，厨房和数据保留，其他成员照常使用。
--
-- 只改外键规则，不改任何数据。可以重复执行。
-- 回滚见 supabase/rollback/20261114010000_keep_kitchen_on_user_delete_down.sql。

alter table public.households alter column owner_id drop not null;
alter table public.households drop constraint if exists households_owner_id_fkey;
alter table public.households
  add constraint households_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete set null;

alter table public.household_snapshots alter column owner_id drop not null;
alter table public.household_snapshots drop constraint if exists household_snapshots_owner_id_fkey;
alter table public.household_snapshots
  add constraint household_snapshots_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete set null;

-- 顺手收回 Supabase 默认给 authenticated 的多余表权限（App 只需要 SELECT，写入都走 RPC）
revoke truncate, trigger, references on public.households from authenticated;
revoke truncate, trigger, references on public.household_members from authenticated;
revoke truncate, trigger, references on public.household_snapshots from authenticated;
