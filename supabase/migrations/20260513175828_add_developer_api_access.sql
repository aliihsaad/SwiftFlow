create table if not exists public.workspace_entitlements (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  developer_api_enabled boolean not null default true,
  entitlement_source text not null default 'preview',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_entitlements_source_check check (entitlement_source in ('preview', 'manual', 'subscription'))
);

create table if not exists public.workspace_api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  key_prefix text not null unique,
  key_hash text not null,
  key_hash_version integer not null default 1,
  scopes text[] not null,
  status text not null default 'active',
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_role_snapshot text,
  expires_at timestamptz,
  last_used_at timestamptz,
  last_used_ip_hash text,
  last_used_user_agent_hash text,
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id) on delete set null,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_api_keys_status_check check (status in ('active', 'revoked', 'expired')),
  constraint workspace_api_keys_name_length check (char_length(name) between 1 and 120),
  constraint workspace_api_keys_scopes_nonempty check (array_length(scopes, 1) >= 1)
);

create index if not exists workspace_api_keys_workspace_id_idx
  on public.workspace_api_keys(workspace_id);

create index if not exists workspace_api_keys_key_prefix_idx
  on public.workspace_api_keys(key_prefix);

create table if not exists public.workspace_api_key_audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  api_key_id uuid references public.workspace_api_keys(id) on delete set null,
  key_prefix text,
  actor_type text not null default 'api_key',
  actor_user_id uuid references auth.users(id) on delete set null,
  request_id text not null,
  method text not null,
  route text not null,
  action text not null,
  scopes_required text[] not null default '{}',
  status_code integer not null,
  ip_hash text,
  user_agent_hash text,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint workspace_api_key_audit_actor_check check (actor_type in ('user', 'api_key', 'system')),
  constraint workspace_api_key_audit_status_code_check check (status_code between 100 and 599)
);

create index if not exists workspace_api_key_audit_logs_workspace_created_idx
  on public.workspace_api_key_audit_logs(workspace_id, created_at desc);

alter table public.workspace_entitlements enable row level security;
alter table public.workspace_api_keys enable row level security;
alter table public.workspace_api_key_audit_logs enable row level security;

drop policy if exists "Members can read workspace entitlement" on public.workspace_entitlements;
create policy "Members can read workspace entitlement"
  on public.workspace_entitlements
  for select
  to authenticated
  using (public.is_member_of(workspace_id));

drop policy if exists "Admins can read API key metadata" on public.workspace_api_keys;
create policy "Admins can read API key metadata"
  on public.workspace_api_keys
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_api_keys.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

drop policy if exists "Admins can read API audit logs" on public.workspace_api_key_audit_logs;
create policy "Admins can read API audit logs"
  on public.workspace_api_key_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_api_key_audit_logs.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

grant select on public.workspace_entitlements to authenticated;
grant select on public.workspace_api_keys to authenticated;
grant select on public.workspace_api_key_audit_logs to authenticated;
grant all on public.workspace_entitlements to service_role;
grant all on public.workspace_api_keys to service_role;
grant all on public.workspace_api_key_audit_logs to service_role;
