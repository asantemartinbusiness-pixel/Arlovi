-- Arlovi dedicated cloud data authority. STAGED, NOT APPLIED.
-- Run only against a NEW Arlovi project after review, never Hilis.
-- Postgres 15+. Authentication uses auth.users and auth.uid().
-- Public data API access is scoped by row-level security. No anon grants.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.arlovi_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) >= 2),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.arlovi_memberships (
  organization_id uuid not null references public.arlovi_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','editor','viewer')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);
create table if not exists public.arlovi_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.arlovi_organizations(id) on delete cascade,
  collection text not null check (length(collection) between 1 and 100),
  title text not null default '',
  status text not null default 'active',
  record jsonb not null check(jsonb_typeof(record)='object'),
  revision integer not null default 1 check(revision>=1),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists arlovi_records_org_collection on public.arlovi_records(organization_id,collection);
create index if not exists arlovi_records_org_updated on public.arlovi_records(organization_id,updated_at desc);
create table if not exists public.arlovi_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.arlovi_organizations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  action text not null,
  record_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists arlovi_audit_events_org_created on public.arlovi_audit_events(organization_id,created_at desc);

create or replace function private.arlovi_can_access(p_org uuid, p_write boolean default false)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.arlovi_organizations o
    where o.id = p_org and (
      o.owner_user_id = (select auth.uid())
      or exists (
        select 1 from public.arlovi_memberships m
        where m.organization_id = o.id and m.user_id = (select auth.uid())
          and m.status = 'active'
          and (not p_write or m.role in ('owner','admin','editor'))
      )
    )
  )
$$;
revoke all on function private.arlovi_can_access(uuid,boolean) from public;
grant execute on function private.arlovi_can_access(uuid,boolean) to authenticated;

-- The membership bootstrap runs as the trigger owner, with a fixed search path,
-- and accepts no arbitrary user input. Invitation acceptance must be a separate
-- authenticated server workflow, NOT client INSERT access.
create or replace function private.arlovi_bootstrap_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.owner_user_id is distinct from (select auth.uid()) then
    raise exception 'Owner must be the currently authenticated user';
  end if;
  insert into public.arlovi_memberships(organization_id,user_id,role,status)
    values(new.id,new.owner_user_id,'owner','active');
  return new;
end;
$$;
revoke all on function private.arlovi_bootstrap_owner() from public,anon,authenticated;
drop trigger if exists arlovi_owner_on_create on public.arlovi_organizations;
create trigger arlovi_owner_on_create after insert on public.arlovi_organizations
for each row execute function private.arlovi_bootstrap_owner();

-- Identity fields may never be reassigned via a generic record update.
create or replace function private.arlovi_guard_record_identity()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
    or new.created_by is distinct from old.created_by
    or new.collection is distinct from old.collection then
    raise exception 'Record identity fields are immutable';
  end if;
  if new.updated_by is distinct from (select auth.uid()) then
    raise exception 'Updater must be the current user';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'Record revision must increment exactly once';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists arlovi_record_identity on public.arlovi_records;
create trigger arlovi_record_identity before update on public.arlovi_records
for each row execute function private.arlovi_guard_record_identity();

alter table public.arlovi_organizations enable row level security;
alter table public.arlovi_memberships enable row level security;
alter table public.arlovi_records enable row level security;
alter table public.arlovi_audit_events enable row level security;
revoke all on public.arlovi_organizations,public.arlovi_memberships,public.arlovi_records,public.arlovi_audit_events from anon,authenticated;
grant select,insert on public.arlovi_organizations to authenticated;
grant update(name,updated_at) on public.arlovi_organizations to authenticated;
grant select on public.arlovi_memberships to authenticated;
grant select,insert,update on public.arlovi_records to authenticated;
grant select,insert on public.arlovi_audit_events to authenticated;

create policy arlovi_org_read on public.arlovi_organizations for select to authenticated
  using (private.arlovi_can_access(id,false));
create policy arlovi_org_create on public.arlovi_organizations for insert to authenticated
  with check (owner_user_id = (select auth.uid()));
create policy arlovi_org_update on public.arlovi_organizations for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));
create policy arlovi_membership_read on public.arlovi_memberships for select to authenticated
  using (private.arlovi_can_access(organization_id,false));
-- No member INSERT/UPDATE/DELETE policy: grants require server-verified invites.
create policy arlovi_record_read on public.arlovi_records for select to authenticated
  using (private.arlovi_can_access(organization_id,false));
create policy arlovi_record_create on public.arlovi_records for insert to authenticated
  with check (
    private.arlovi_can_access(organization_id,true)
    and created_by = (select auth.uid()) and updated_by = (select auth.uid())
    and revision = 1
  );
create policy arlovi_record_update on public.arlovi_records for update to authenticated
  using (private.arlovi_can_access(organization_id,true))
  with check (private.arlovi_can_access(organization_id,true) and updated_by = (select auth.uid()));
create policy arlovi_event_read on public.arlovi_audit_events for select to authenticated
  using (private.arlovi_can_access(organization_id,false));
create policy arlovi_event_insert on public.arlovi_audit_events for insert to authenticated
  with check (
    private.arlovi_can_access(organization_id,true)
    and actor_user_id = (select auth.uid())
  );
commit;

-- IMPORTANT FOLLOW-UPS BEFORE LIVE SYNC
-- 1. Design server-side invite acceptance and revoke paths; membership writes are closed by default.
-- 2. Add a request-scoped compare-and-swap API and validation for record JSON shapes.
-- 3. Split authoritative audit provenance from user-submitted descriptive events.
-- 4. Add executable cross-tenant RLS/IDOR, concurrent write, membership revoke,
--    token expiry, backup/restore and security-advisor tests.
-- 5. Map local 'org-*' and fixture IDs to server UUIDs only after authenticated
--    ownership proof and explicit import approval. No automatic upload.
