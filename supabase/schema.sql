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
  primary key (household_id, user_id)
);

create table if not exists public.household_snapshots (
  household_id uuid primary key references public.households(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_snapshots enable row level security;
alter table public.household_invites enable row level security;

create policy "members can read households" on public.households
for select using (
  owner_id = auth.uid() or exists (
    select 1 from public.household_members m
    where m.household_id = id and m.user_id = auth.uid()
  )
);

create policy "owners manage snapshots" on public.household_snapshots
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "members read snapshots" on public.household_snapshots
for select using (
  exists (
    select 1 from public.household_members m
    where m.household_id = household_id and m.user_id = auth.uid()
  )
);

create policy "inviters manage invites" on public.household_invites
for all using (inviter_id = auth.uid()) with check (inviter_id = auth.uid());
