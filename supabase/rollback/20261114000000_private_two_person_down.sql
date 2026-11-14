-- 回滚 20261114000000_private_two_person
-- 只撤掉这个 migration 新增的白名单和注册拦截。
-- 被删除的公开版函数（邀请、移交、移除成员、注销账号）和 household_invites 表
-- 如需恢复，请从 migrations/20261101000000_baseline.sql 里重新执行对应的
-- create table / create function / grant 语句；旧邀请码数据无法恢复（本来 7 天就过期）。

drop trigger if exists enforce_allowed_signup on auth.users;
drop function if exists private.enforce_allowed_signup();

-- 恢复不带白名单的成员判断
create or replace function private.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = (select auth.uid())
  );
$$;

-- household_overview / ensure_household 里调用了 private.is_allowed_member，
-- 先从 baseline 重新执行这两个函数，再删白名单
-- drop function if exists private.is_allowed_member();
-- drop table if exists private.allowed_members;
