\set ON_ERROR_STOP on

create extension if not exists pgcrypto;

revoke create on schema public from public;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
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

create index automations_workspace_active_idx
  on public.automations (workspace_id, is_active, editor_version);

create index social_accounts_external_id_idx
  on public.social_accounts (account_id);

alter table public.social_accounts enable row level security;
alter table public.automations enable row level security;
