-- Arlovi × Nango dedicated integration registry and durable event contract.
-- STAGED ONLY. Do NOT apply against unrelated Hilis databases.
-- Prerequisites: infra/supabase/arlovi_cloud_schema.sql applied to a NEW
-- dedicated Arlovi project; Auth & RLS policies verified and reviewed.
-- Import using an approved migration only after full database QA.
--
-- This schema contains no provider credentials. Nango holds their encrypted
-- OAuth tokens. Browser users have SELECT-only metadata access via RLS.
-- All mutations come from trusted server handlers AFTER permission checks.
begin;

create table if not exists public.arlovi_integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.arlovi_organizations(id) on delete cascade,
  provider_config_key text not null check (provider_config_key ~ '^[a-z0-9][a-z0-9_-]{1,95}$'),
  provider_name text not null default '',
  nango_connection_id text check (nango_connection_id is null or length(nango_connection_id) between 1 and 256),
  connection_name text not null default '',
  ownership text not null default 'organization' check (ownership in ('organization','personal','department')),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  department_id text,
  status text not null default 'pending' check (status in ('pending','authorised','needs_attention','suspended','disconnected')),
  activation text not null default 'inactive' check (activation in ('inactive','read_only','approved_writes')),
  read_verified_at timestamptz,
  sync_health text not null default 'not_configured' check (sync_health in ('not_configured','healthy','degraded','failed')),
  latest_error_code text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disconnected_at timestamptz,
  constraint arlovi_connection_dept_scope check (
    (ownership = 'department' and department_id is not null)
    or (ownership <> 'department' and department_id is null)
  ),
  constraint arlovi_connection_auth_gate check (
    activation = 'inactive' or (status = 'authorised' and read_verified_at is not null)
  )
);
create unique index if not exists arlovi_connection_provider_external_unique
  on public.arlovi_integration_connections (organization_id,provider_config_key,nango_connection_id)
  where nango_connection_id is not null;
create index if not exists arlovi_connection_org_status
  on public.arlovi_integration_connections (organization_id,status,updated_at desc);
create index if not exists arlovi_connection_owner
  on public.arlovi_integration_connections (organization_id,owner_user_id);

-- Permissions are explicit. A connection is NOT permission for an AI employee
-- to act. Human approval remains mandatory for high-impact write operations.
create table if not exists public.arlovi_integration_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.arlovi_organizations(id) on delete cascade,
  connection_id uuid not null references public.arlovi_integration_connections(id) on delete cascade,
  subject_type text not null check (subject_type in ('user','department','application','agent')),
  subject_id text not null check (length(subject_id) between 1 and 160),
  can_read boolean not null default false,
  can_write boolean not null default false,
  requires_human_approval boolean not null default true,
  approved_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(connection_id,subject_type,subject_id),
  constraint arlovi_access_write_requires_read check (not can_write or can_read),
  constraint arlovi_access_nonempty check (can_read or can_write)
);
create index if not exists arlovi_access_org_conn
  on public.arlovi_integration_access (organization_id,connection_id);

create table if not exists public.arlovi_integration_sync_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.arlovi_organizations(id) on delete cascade,
  connection_id uuid not null references public.arlovi_integration_connections(id) on delete cascade,
  object_type text not null check (length(object_type) between 1 and 100),
  direction text not null default 'import' check (direction in ('import','bidirectional')),
  enabled boolean not null default false,
  canonical_source text not null default 'external',
  last_completed_at timestamptz,
  last_checkpoint text,
  error_count integer not null default 0 check (error_count >= 0),
  conflicts_count integer not null default 0 check (conflicts_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id,object_type)
);
create index if not exists arlovi_sync_org_enabled
  on public.arlovi_integration_sync_policies (organization_id,enabled);

-- Ensure every child row belongs to the SAME company as its connection;
-- independent company IDs in client payloads must never be sufficient.
create or replace function private.arlovi_guard_integration_child_org()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.arlovi_integration_connections c
    where c.id = new.connection_id and c.organization_id = new.organization_id
  ) then
    raise exception 'Integration reference must belong to the same organisation';
  end if;
  return new;
end;
$$;
revoke all on function private.arlovi_guard_integration_child_org() from public, anon, authenticated;
drop trigger if exists arlovi_access_same_org on public.arlovi_integration_access;
create trigger arlovi_access_same_org before insert or update on public.arlovi_integration_access
for each row execute function private.arlovi_guard_integration_child_org();
drop trigger if exists arlovi_sync_same_org on public.arlovi_integration_sync_policies;
create trigger arlovi_sync_same_org before insert or update on public.arlovi_integration_sync_policies
for each row execute function private.arlovi_guard_integration_child_org();

-- Enforce that a connected account cannot be silently transferred across orgs,
-- or have its Nango connection identifier replaced with another account.
create or replace function private.arlovi_guard_integration_identity()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
     or new.provider_config_key is distinct from old.provider_config_key
     or (old.nango_connection_id is not null and new.nango_connection_id is distinct from old.nango_connection_id)
  then
    raise exception 'Integration identity is immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.arlovi_guard_integration_identity() from public, anon, authenticated;
drop trigger if exists arlovi_conn_immutable on public.arlovi_integration_connections;
create trigger arlovi_conn_immutable before update on public.arlovi_integration_connections
for each row execute function private.arlovi_guard_integration_identity();

-- Private inbox: signed webhooks are persisted first. A worker claims the
-- event using a unique digest/id; retries cannot create duplicate work.
create table if not exists private.arlovi_integration_event_inbox (
  id uuid primary key default gen_random_uuid(),
  digest text not null unique check (digest ~ '^[0-9a-f]{64}$'),
  nango_event_id text,
  organization_id uuid references public.arlovi_organizations(id) on delete restrict,
  connection_id uuid references public.arlovi_integration_connections(id) on delete restrict,
  provider_config_key text,
  raw_event jsonb not null check (jsonb_typeof(raw_event) = 'object'),
  state text not null default 'queued' check (state in ('queued','processing','completed','retry','dead')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  locked_until timestamptz,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists arlovi_event_pending
  on private.arlovi_integration_event_inbox (state,next_attempt_at,received_at);
alter table private.arlovi_integration_event_inbox enable row level security;
revoke all on private.arlovi_integration_event_inbox from anon,authenticated;

-- Canonical server-side audit: clients may view their company's receipts
-- but cannot forge authoritative external execution logs.
create table if not exists public.arlovi_integration_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.arlovi_organizations(id) on delete cascade,
  connection_id uuid references public.arlovi_integration_connections(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_kind text not null check (length(event_kind) between 1 and 100),
  outcome text not null check (outcome in ('accepted','succeeded','failed','blocked')),
  event_digest text,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  at timestamptz not null default now()
);
create index if not exists arlovi_int_audit_org_time
  on public.arlovi_integration_audit (organization_id,at desc);
alter table public.arlovi_integration_connections enable row level security;
alter table public.arlovi_integration_access enable row level security;
alter table public.arlovi_integration_sync_policies enable row level security;
alter table public.arlovi_integration_audit enable row level security;
revoke all on public.arlovi_integration_connections,
  public.arlovi_integration_access,
  public.arlovi_integration_sync_policies,
  public.arlovi_integration_audit from anon,authenticated;
grant select on public.arlovi_integration_connections,
  public.arlovi_integration_access,
  public.arlovi_integration_sync_policies,
  public.arlovi_integration_audit to authenticated;
create policy arlovi_connection_read on public.arlovi_integration_connections
for select to authenticated using (
  private.arlovi_can_access(organization_id,false)
  and (
    ownership <> 'personal' or owner_user_id = (select auth.uid())
    or exists (
      select 1 from public.arlovi_memberships m
      where m.organization_id = arlovi_integration_connections.organization_id and m.user_id = (select auth.uid())
        and m.status = 'active' and m.role in ('owner','admin')
    )
  )
);
create policy arlovi_access_read on public.arlovi_integration_access
for select to authenticated using (
  private.arlovi_can_access(organization_id,false)
);
create policy arlovi_sync_read on public.arlovi_integration_sync_policies
for select to authenticated using (
  private.arlovi_can_access(organization_id,false)
);
create policy arlovi_integration_audit_read on public.arlovi_integration_audit
for select to authenticated using (
  private.arlovi_can_access(organization_id,false)
);
-- Deliberately no INSERT/UPDATE/DELETE for authenticated or anon roles.
commit;

-- PRODUCTION PREREQUISITES:
-- Apply the account schema first to a NEW dedicated Arlovi Supabase project.
-- Review all RLS and trigger policies with Supabase advisors.
-- Build an authenticated server-side connection registry writer and an event
-- ingestion worker using restricted credentials, with validation/idempotency.
-- Test wrong-tenant child IDs, member revocation, personal connection access,
-- simultaneous event deliveries and repeated syncs before activation.
