-- Grant Pilot — migration 002: groups
-- Run this in Supabase → SQL Editor → New query. Safe to run more than once.

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


-- =====================================================================
-- ONE-TIME CLEANUP — only if a teammate accidentally created their own
-- organization instead of joining yours.
--
-- 1. Run this to see what you have:
--
--      select p.full_name, p.role, o.name as org_name, o.join_code
--      from profiles p join orgs o on o.id = p.org_id
--      order by o.name;
--
-- 2. If you see more than one org_name, uncomment the two statements
--    below, replace YOURCODE with your own join code, and run them.
-- =====================================================================

-- update public.profiles
--   set org_id = (select id from public.orgs where join_code = 'YOURCODE'),
--       role   = 'writer',
--       group_id = null
--   where org_id <> (select id from public.orgs where join_code = 'YOURCODE');

-- delete from public.orgs
--   where id not in (select org_id from public.profiles);
