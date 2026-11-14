-- 鲜食记 · 两人私用版
--
-- 不再开放注册，也不需要每个人自己的账号：
-- 两台手机都在后台用同一个共享账号自动登录（凭据在 .env），
-- 只有 private.allowed_members 里的邮箱能读写厨房数据。
--
-- 可以重复执行。旧的家庭和快照数据会保留，
-- 只删掉邀请、移交管理员、移除成员、注销账号这些公开版功能。
-- 回滚见 supabase/rollback/20261114000000_private_two_person_down.sql。

create extension if not exists pgcrypto;
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 白名单（允许登录的账号）
-- ---------------------------------------------------------------------------

create table if not exists private.allowed_members (
  email text primary key check (email = lower(email)),
  display_name text,
  added_at timestamptz not null default now()
);

create or replace function private.is_allowed_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.allowed_members a
    join auth.users u on lower(u.email) = a.email
    where u.id = (select auth.uid())
  );
$$;

-- 即使 Supabase 后台误开了注册，不在白名单里的邮箱也建不了账号
create or replace function private.enforce_allowed_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or not exists (
    select 1 from private.allowed_members a where a.email = lower(new.email)
  ) then
    raise exception 'not-allowed-member';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_allowed_signup on auth.users;
create trigger enforce_allowed_signup
before insert on auth.users
for each row execute function private.enforce_allowed_signup();

-- ---------------------------------------------------------------------------
-- 厨房数据
-- ---------------------------------------------------------------------------

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.household_snapshots (
  household_id uuid primary key references public.households(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.household_members add column if not exists joined_at timestamptz not null default now();
alter table public.household_snapshots add column if not exists version bigint not null default 0;
alter table public.household_snapshots add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 清理公开版功能
-- ---------------------------------------------------------------------------

drop function if exists public.create_household_invite(uuid, text);
drop function if exists public.accept_household_invite(text);
drop function if exists public.transfer_household_ownership(uuid, uuid);
drop function if exists public.remove_household_member(uuid, uuid);
drop function if exists public.leave_household(uuid);
drop function if exists public.delete_own_account();
drop function if exists public.create_household(text);
drop table if exists public.household_invites;

-- ---------------------------------------------------------------------------
-- 权限
-- ---------------------------------------------------------------------------

create or replace function private.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_allowed_member() and exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = (select auth.uid())
  );
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_snapshots enable row level security;

drop policy if exists "members can read households" on public.households;
drop policy if exists "owners manage snapshots" on public.household_snapshots;
drop policy if exists "members read snapshots" on public.household_snapshots;
drop policy if exists "households_select" on public.households;
drop policy if exists "households_insert" on public.households;
drop policy if exists "households_update" on public.households;
drop policy if exists "members_select" on public.household_members;
drop policy if exists "snapshots_select" on public.household_snapshots;

create policy "households_select"
on public.households for select to authenticated
using ((select private.is_household_member(id)));

create policy "members_select"
on public.household_members for select to authenticated
using ((select private.is_household_member(household_id)));

create policy "snapshots_select"
on public.household_snapshots for select to authenticated
using ((select private.is_household_member(household_id)));

revoke all on public.households from anon;
revoke all on public.household_members from anon;
revoke all on public.household_snapshots from anon;
revoke insert, update, delete on public.households from authenticated;
revoke insert, update, delete on public.household_members from authenticated;
revoke insert, update, delete on public.household_snapshots from authenticated;
grant select on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select on public.household_snapshots to authenticated;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

create or replace function public.household_overview(p_household_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_household_name text;
  v_members jsonb;
begin
  if v_user_id is null then
    raise exception 'cloud-not-signed-in';
  end if;
  if not private.is_allowed_member() then
    raise exception 'not-allowed-member';
  end if;

  select h.id, h.name
  into v_household_id, v_household_name
  from public.households h
  join public.household_members hm on hm.household_id = h.id
  where hm.user_id = v_user_id
    and (p_household_id is null or h.id = p_household_id)
  order by hm.joined_at
  limit 1;

  if v_household_id is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'userId', hm.user_id,
        'email', coalesce(u.email, ''),
        'displayName', coalesce(
          nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
          nullif(trim(a.display_name), ''),
          split_part(coalesce(u.email, '成员'), '@', 1)
        ),
        'joinedAt', hm.joined_at
      ) order by hm.joined_at
    ),
    '[]'::jsonb
  )
  into v_members
  from public.household_members hm
  join auth.users u on u.id = hm.user_id
  left join private.allowed_members a on a.email = lower(u.email)
  where hm.household_id = v_household_id;

  return jsonb_build_object(
    'id', v_household_id,
    'name', v_household_name,
    'members', v_members
  );
end;
$$;

-- 登录后调用：已经在厨房里就直接返回；否则加入唯一的共享厨房，没有就新建
create or replace function public.ensure_household(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
begin
  if v_user_id is null then
    raise exception 'cloud-not-signed-in';
  end if;
  if not private.is_allowed_member() then
    raise exception 'not-allowed-member';
  end if;

  select hm.household_id
  into v_household_id
  from public.household_members hm
  where hm.user_id = v_user_id
  order by hm.joined_at
  limit 1;

  if v_household_id is not null then
    return public.household_overview(v_household_id);
  end if;

  -- 两个人同时第一次登录时，避免各建一个厨房
  perform pg_advisory_xact_lock(hashtext('pantry-chef-shared-kitchen'));

  select h.id into v_household_id
  from public.households h
  order by h.created_at
  limit 1;

  if v_household_id is null then
    insert into public.households(name, owner_id)
    values (coalesce(nullif(trim(p_name), ''), '我们的厨房'), v_user_id)
    returning id into v_household_id;

    insert into public.household_members(household_id, user_id, role)
    values (v_household_id, v_user_id, 'owner');

    insert into public.household_snapshots(household_id, owner_id, payload, version, updated_by)
    values (v_household_id, v_user_id, '{}'::jsonb, 0, v_user_id);
  else
    insert into public.household_members(household_id, user_id, role)
    values (v_household_id, v_user_id, 'member')
    on conflict (household_id, user_id) do nothing;
  end if;

  return public.household_overview(v_household_id);
end;
$$;

create or replace function public.push_household_snapshot(
  p_household_id uuid,
  p_payload jsonb,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_snapshot public.household_snapshots%rowtype;
  v_applied boolean := false;
begin
  if v_user_id is null or not private.is_household_member(p_household_id) then
    raise exception 'household-member-required';
  end if;

  update public.household_snapshots
  set payload = p_payload,
      version = version + 1,
      updated_by = v_user_id,
      updated_at = now()
  where household_id = p_household_id
    and version = p_expected_version
  returning * into v_snapshot;

  if v_snapshot.household_id is not null then
    v_applied := true;
  else
    select * into v_snapshot
    from public.household_snapshots
    where household_id = p_household_id;
  end if;

  return jsonb_build_object(
    'applied', v_applied,
    'householdId', v_snapshot.household_id,
    'payload', v_snapshot.payload,
    'version', v_snapshot.version,
    'updatedAt', v_snapshot.updated_at,
    'updatedBy', v_snapshot.updated_by
  );
end;
$$;

revoke all on function public.household_overview(uuid) from public, anon;
revoke all on function public.ensure_household(text) from public, anon;
revoke all on function public.push_household_snapshot(uuid, jsonb, bigint) from public, anon;
grant execute on function public.household_overview(uuid) to authenticated;
grant execute on function public.ensure_household(text) to authenticated;
grant execute on function public.push_household_snapshot(uuid, jsonb, bigint) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'household_snapshots'
  ) then
    alter publication supabase_realtime add table public.household_snapshots;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 把共享账号的邮箱填进来（改成真实邮箱后取消注释再运行）
-- 先加白名单，再去 Authentication → Users 用同一个邮箱建账号
-- ---------------------------------------------------------------------------

-- insert into private.allowed_members(email, display_name) values
--   ('our-kitchen@example.com', '我们的厨房')
-- on conflict (email) do update set display_name = excluded.display_name;
