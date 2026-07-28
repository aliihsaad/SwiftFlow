create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Integration Workspace',
  created_at timestamptz not null default now()
);

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform text not null default 'instagram',
  account_id text not null,
  access_token text,
  refresh_token text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  is_active boolean not null default true,
  editor_version text not null default 'canvas',
  workflow_graph jsonb,
  created_at timestamptz not null default now()
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  status text not null default 'queued',
  trigger_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.automation_scheduled_executions (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  execution_id uuid not null,
  node_id text not null,
  execution_context jsonb not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index automations_workspace_active_idx
  on public.automations (workspace_id, is_active, editor_version);

create index social_accounts_external_id_idx
  on public.social_accounts (account_id);

alter table public.social_accounts enable row level security;
alter table public.automations enable row level security;
