create extension if not exists pgcrypto;
create schema if not exists private;

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

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  code text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

alter table public.household_members add column if not exists joined_at timestamptz not null default now();
alter table public.household_snapshots add column if not exists version bigint not null default 0;
alter table public.household_snapshots add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.household_invites add column if not exists code text;
alter table public.household_invites add column if not exists accepted_by uuid references auth.users(id) on delete set null;
alter table public.household_invites add column if not exists accepted_at timestamptz;
alter table public.household_invites add column if not exists expires_at timestamptz not null default (now() + interval '7 days');

create unique index if not exists household_invites_code_key
on public.household_invites(code)
where code is not null;

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

create or replace function private.is_household_owner(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.households h
    where h.id = p_household_id
      and h.owner_id = (select auth.uid())
  );
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_snapshots enable row level security;
alter table public.household_invites enable row level security;

drop policy if exists "members can read households" on public.households;
drop policy if exists "owners manage snapshots" on public.household_snapshots;
drop policy if exists "members read snapshots" on public.household_snapshots;
drop policy if exists "inviters manage invites" on public.household_invites;
drop policy if exists "households_select" on public.households;
drop policy if exists "households_insert" on public.households;
drop policy if exists "households_update" on public.households;
drop policy if exists "members_select" on public.household_members;
drop policy if exists "snapshots_select" on public.household_snapshots;
drop policy if exists "invites_select" on public.household_invites;

create policy "households_select"
on public.households for select to authenticated
using ((select private.is_household_member(id)));

create policy "households_insert"
on public.households for insert to authenticated
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create policy "households_update"
on public.households for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "members_select"
on public.household_members for select to authenticated
using ((select private.is_household_member(household_id)));

create policy "snapshots_select"
on public.household_snapshots for select to authenticated
using ((select private.is_household_member(household_id)));

create policy "invites_select"
on public.household_invites for select to authenticated
using (
  (select private.is_household_owner(household_id))
  or lower(email) = lower(coalesce((select auth.jwt()->>'email'), ''))
);

revoke all on public.households from anon;
revoke all on public.household_members from anon;
revoke all on public.household_snapshots from anon;
revoke all on public.household_invites from anon;
grant select on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select on public.household_snapshots to authenticated;
grant select on public.household_invites to authenticated;

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
  v_owner_id uuid;
  v_role text;
  v_members jsonb;
  v_invites jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'cloud-not-signed-in';
  end if;

  select h.id, h.name, h.owner_id, hm.role
  into v_household_id, v_household_name, v_owner_id, v_role
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
        'displayName', coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'), ''), split_part(coalesce(u.email, '成员'), '@', 1)),
        'role', hm.role,
        'joinedAt', hm.joined_at
      ) order by hm.joined_at
    ),
    '[]'::jsonb
  )
  into v_members
  from public.household_members hm
  join auth.users u on u.id = hm.user_id
  where hm.household_id = v_household_id;

  if v_owner_id = v_user_id then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'email', i.email,
          'code', i.code,
          'status', i.status,
          'createdAt', i.created_at,
          'expiresAt', i.expires_at
        ) order by i.created_at desc
      ) filter (where i.id is not null),
      '[]'::jsonb
    )
    into v_invites
    from public.household_invites i
    where i.household_id = v_household_id
      and i.status = 'pending'
      and i.expires_at > now();
  end if;

  return jsonb_build_object(
    'id', v_household_id,
    'name', v_household_name,
    'ownerId', v_owner_id,
    'role', v_role,
    'members', v_members,
    'invites', v_invites
  );
end;
$$;

create or replace function public.create_household(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_user_id is null then
    raise exception 'cloud-not-signed-in';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 40 then
    raise exception 'invalid-household-name';
  end if;
  if exists (
    select 1 from public.household_members hm where hm.user_id = v_user_id
  ) then
    raise exception 'already-in-household';
  end if;

  insert into public.households(name, owner_id)
  values (v_name, v_user_id)
  returning id into v_household_id;

  insert into public.household_members(household_id, user_id, role)
  values (v_household_id, v_user_id, 'owner');

  insert into public.household_snapshots(household_id, owner_id, payload, version, updated_by)
  values (v_household_id, v_user_id, '{}'::jsonb, 0, v_user_id);

  return public.household_overview(v_household_id);
end;
$$;

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

  select hm.household_id
  into v_household_id
  from public.household_members hm
  where hm.user_id = v_user_id
  order by hm.joined_at
  limit 1;

  if v_household_id is null then
    return public.create_household(coalesce(nullif(trim(p_name), ''), '我的厨房'));
  end if;

  return public.household_overview(v_household_id);
end;
$$;

create or replace function public.create_household_invite(p_household_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_invite public.household_invites%rowtype;
begin
  if v_user_id is null or not private.is_household_owner(p_household_id) then
    raise exception 'household-owner-required';
  end if;
  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'invalid-email';
  end if;

  update public.household_invites
  set status = 'cancelled'
  where household_id = p_household_id and lower(email) = v_email and status = 'pending';

  insert into public.household_invites(
    household_id,
    inviter_id,
    email,
    code,
    status,
    expires_at
  )
  values (
    p_household_id,
    v_user_id,
    v_email,
    lower(encode(gen_random_bytes(6), 'hex')),
    'pending',
    now() + interval '7 days'
  )
  returning * into v_invite;

  return jsonb_build_object(
    'id', v_invite.id,
    'email', v_invite.email,
    'code', v_invite.code,
    'status', v_invite.status,
    'createdAt', v_invite.created_at,
    'expiresAt', v_invite.expires_at
  );
end;
$$;

create or replace function public.accept_household_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_invite public.household_invites%rowtype;
  v_existing_household_id uuid;
begin
  if v_user_id is null then
    raise exception 'cloud-not-signed-in';
  end if;

  select *
  into v_invite
  from public.household_invites
  where code = lower(trim(p_code))
    and status = 'pending'
    and expires_at > now()
  for update;

  if v_invite.id is null then
    raise exception 'invite-not-found';
  end if;
  if lower(v_invite.email) <> v_user_email then
    raise exception 'invite-email-mismatch';
  end if;

  select hm.household_id into v_existing_household_id
  from public.household_members hm
  where hm.user_id = v_user_id
  order by hm.joined_at
  limit 1;

  if v_existing_household_id is not null and v_existing_household_id <> v_invite.household_id then
    raise exception 'already-in-household';
  end if;

  insert into public.household_members(household_id, user_id, role)
  values (v_invite.household_id, v_user_id, 'member')
  on conflict (household_id, user_id) do nothing;

  update public.household_invites
  set status = 'accepted', accepted_by = v_user_id, accepted_at = now()
  where id = v_invite.id;

  return public.household_overview(v_invite.household_id);
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

create or replace function public.transfer_household_ownership(
  p_household_id uuid,
  p_new_owner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.is_household_owner(p_household_id) then
    raise exception 'household-owner-required';
  end if;
  if p_new_owner_id = v_user_id then
    raise exception 'already-household-owner';
  end if;
  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household_id and hm.user_id = p_new_owner_id
  ) then
    raise exception 'household-member-not-found';
  end if;

  update public.households set owner_id = p_new_owner_id where id = p_household_id;
  update public.household_snapshots set owner_id = p_new_owner_id where household_id = p_household_id;
  update public.household_members
  set role = case when user_id = p_new_owner_id then 'owner' else 'member' end
  where household_id = p_household_id and user_id in (v_user_id, p_new_owner_id);

  return public.household_overview(p_household_id);
end;
$$;

create or replace function public.remove_household_member(
  p_household_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.is_household_owner(p_household_id) then
    raise exception 'household-owner-required';
  end if;
  if p_member_id = v_user_id then
    raise exception 'owner-cannot-remove-self';
  end if;
  delete from public.household_members
  where household_id = p_household_id and user_id = p_member_id and role <> 'owner';
  if not found then raise exception 'household-member-not-found'; end if;
  return public.household_overview(p_household_id);
end;
$$;

create or replace function public.leave_household(p_household_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_owner boolean;
  v_member_count integer;
begin
  if v_user_id is null or not private.is_household_member(p_household_id) then
    raise exception 'household-member-required';
  end if;
  select owner_id = v_user_id into v_is_owner from public.households where id = p_household_id;
  select count(*) into v_member_count from public.household_members where household_id = p_household_id;
  if v_is_owner and v_member_count > 1 then
    raise exception 'transfer-household-first';
  end if;
  if v_is_owner then
    delete from public.households where id = p_household_id;
  else
    delete from public.household_members where household_id = p_household_id and user_id = v_user_id;
  end if;
  return true;
end;
$$;

create or replace function public.delete_own_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'cloud-not-signed-in'; end if;
  if exists (
    select 1
    from public.households h
    join public.household_members hm on hm.household_id = h.id
    where h.owner_id = v_user_id and hm.user_id <> v_user_id
  ) then
    raise exception 'transfer-household-first';
  end if;
  delete from auth.users where id = v_user_id;
  return true;
end;
$$;

revoke all on function public.household_overview(uuid) from public, anon;
revoke all on function public.create_household(text) from public, anon;
revoke all on function public.ensure_household(text) from public, anon;
revoke all on function public.create_household_invite(uuid, text) from public, anon;
revoke all on function public.accept_household_invite(text) from public, anon;
revoke all on function public.push_household_snapshot(uuid, jsonb, bigint) from public, anon;
revoke all on function public.transfer_household_ownership(uuid, uuid) from public, anon;
revoke all on function public.remove_household_member(uuid, uuid) from public, anon;
revoke all on function public.leave_household(uuid) from public, anon;
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.household_overview(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.ensure_household(text) to authenticated;
grant execute on function public.create_household_invite(uuid, text) to authenticated;
grant execute on function public.accept_household_invite(text) to authenticated;
grant execute on function public.push_household_snapshot(uuid, jsonb, bigint) to authenticated;
grant execute on function public.transfer_household_ownership(uuid, uuid) to authenticated;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;
grant execute on function public.leave_household(uuid) to authenticated;
grant execute on function public.delete_own_account() to authenticated;

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
