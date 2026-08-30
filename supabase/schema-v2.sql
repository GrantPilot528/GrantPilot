-- Grant Pilot — upgrade 2: groups
-- Safe to run on an existing database. Run it once in Supabase → SQL Editor.
-- It does not touch data you already have.

create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create index if not exists groups_org_idx on public.groups (org_id);

alter table public.profiles
  add column if not exists group_id uuid references public.groups(id) on delete set null;

alter table public.groups enable row level security;

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated using (org_id = public.my_org());

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert to authenticated
  with check (org_id = public.my_org() and public.is_admin());

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update to authenticated
  using (org_id = public.my_org() and public.is_admin())
  with check (org_id = public.my_org() and public.is_admin());

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete to authenticated
  using (org_id = public.my_org() and public.is_admin());

-- Admins already had permission to edit anyone in their organization, which now
-- covers group_id and goal fields. Nothing else to change.
