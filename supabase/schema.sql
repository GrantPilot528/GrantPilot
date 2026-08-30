-- Grant Pilot — database schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run once on a fresh project.

-- ============================ tables ============================

create table if not exists public.orgs (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  join_code           text not null unique,
  zip                 text,
  legal_name          text,
  ein                 text,
  website             text,
  address             text,
  mission             text,
  need_statement      text,
  program_description text,
  population_served   text,
  people_served       text,
  outcomes            text,
  org_history         text,
  leadership          text,
  annual_budget       text,
  contact_block       text,
  created_at          timestamptz not null default now()
);

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  org_id        uuid not null references public.orgs(id) on delete cascade,
  full_name     text not null,
  role          text not null default 'writer' check (role in ('admin','writer')),
  zip           text,
  focus_areas   text[] not null default '{}',
  signature     text,
  goal_target   int,
  goal_deadline date,
  goal_start    date,
  created_at    timestamptz not null default now()
);

create table if not exists public.opportunities (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  title           text not null,
  funder          text,
  amount          text,
  deadline        date,
  url             text,
  geo_restriction text,
  notes           text,
  tags            text[] not null default '{}',
  source          text,
  external_id     text,
  status          text not null default 'open',
  owner_id        uuid references public.profiles(id) on delete set null,
  passed_by       uuid[] not null default '{}',
  created_at      timestamptz not null default now()
);

create index if not exists opportunities_org_idx on public.opportunities (org_id, deadline);
create unique index if not exists opportunities_external_idx
  on public.opportunities (org_id, external_id) where external_id is not null;

-- ======================= helper functions =======================
-- security definer so policies can read profiles without recursing into
-- the very policy being evaluated.

create or replace function public.my_org()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.gen_join_code()
returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                           (floor(random()*32)::int)+1, 1), '')
  from generate_series(1,8)
$$;

-- Creates an organization and makes the caller its administrator.
create or replace function public.create_org(p_org_name text, p_full_name text, p_zip text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_code text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'You already belong to an organization';
  end if;

  loop
    v_code := public.gen_join_code();
    exit when not exists (select 1 from public.orgs where join_code = v_code);
  end loop;

  insert into public.orgs (name, join_code, zip) values (p_org_name, v_code, p_zip)
  returning id into v_org;

  insert into public.profiles (id, org_id, full_name, role, zip)
  values (auth.uid(), v_org, p_full_name, 'admin', p_zip);

  return v_org;
end $$;

-- Joins an existing organization using its team code.
create or replace function public.join_org(p_code text, p_full_name text, p_zip text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'You already belong to an organization';
  end if;

  select id into v_org from public.orgs where join_code = upper(trim(p_code));
  if v_org is null then raise exception 'That team code does not match any organization'; end if;

  insert into public.profiles (id, org_id, full_name, role, zip)
  values (auth.uid(), v_org, p_full_name, 'writer', p_zip);

  return v_org;
end $$;

-- ==================== row level security ========================

alter table public.orgs          enable row level security;
alter table public.profiles      enable row level security;
alter table public.opportunities enable row level security;

drop policy if exists orgs_select on public.orgs;
create policy orgs_select on public.orgs
  for select to authenticated using (id = public.my_org());

drop policy if exists orgs_update on public.orgs;
create policy orgs_update on public.orgs
  for update to authenticated
  using (id = public.my_org() and public.is_admin())
  with check (id = public.my_org() and public.is_admin());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (org_id = public.my_org());

-- You may always edit yourself. Admins may edit anyone in their org.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or (org_id = public.my_org() and public.is_admin()))
  with check (org_id = public.my_org());

drop policy if exists opps_select on public.opportunities;
create policy opps_select on public.opportunities
  for select to authenticated using (org_id = public.my_org());

drop policy if exists opps_insert on public.opportunities;
create policy opps_insert on public.opportunities
  for insert to authenticated with check (org_id = public.my_org());

drop policy if exists opps_update on public.opportunities;
create policy opps_update on public.opportunities
  for update to authenticated
  using (org_id = public.my_org()) with check (org_id = public.my_org());

drop policy if exists opps_delete on public.opportunities;
create policy opps_delete on public.opportunities
  for delete to authenticated
  using (org_id = public.my_org() and public.is_admin());

-- Note: there is deliberately no INSERT policy on orgs or profiles.
-- Both rows are created only through create_org() / join_org(), which run
-- as security definer. That stops anyone from attaching themselves to an
-- organization they were not invited to.
