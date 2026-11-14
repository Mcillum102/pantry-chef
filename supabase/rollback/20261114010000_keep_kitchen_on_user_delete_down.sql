-- 回滚 20261114010000_keep_kitchen_on_user_delete：恢复 on delete cascade 和 not null。
-- 如果期间有账号被删、owner_id 已经变成 null，先给这些行填一个现有用户，否则 set not null 会失败：
--   select id, name from public.households where owner_id is null;

alter table public.households drop constraint if exists households_owner_id_fkey;
alter table public.households
  add constraint households_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;
alter table public.households alter column owner_id set not null;

alter table public.household_snapshots drop constraint if exists household_snapshots_owner_id_fkey;
alter table public.household_snapshots
  add constraint household_snapshots_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;
alter table public.household_snapshots alter column owner_id set not null;

grant truncate, trigger, references on public.households to authenticated;
grant truncate, trigger, references on public.household_members to authenticated;
grant truncate, trigger, references on public.household_snapshots to authenticated;
