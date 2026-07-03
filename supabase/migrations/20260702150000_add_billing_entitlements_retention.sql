-- Billing, entitlements, and retention control plane (Task 3, 2026-07-02 plan).
--
-- Adds Stripe billing state, tier-aware entitlements/retention policy storage,
-- storage object tracking, and retention cleanup run bookkeeping.
--
-- Access model:
--   - Workspace members can read their own workspace billing/entitlement state.
--   - All writes happen through service-role clients (Stripe webhook route,
--     internal edge functions). No authenticated write policies are created.
--   - stripe_webhook_events and retention_cleanup_runs are service-role only.

-- 1. Stripe customer mapping -------------------------------------------------

create table if not exists public.workspace_billing_customers (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Subscription state (Stripe webhooks are the source of truth) ------------

create table if not exists public.workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  stripe_price_id text,
  plan_tier text not null default 'free',
  status text not null default 'none',
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  downgrade_grace_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_subscriptions_tier_check check (plan_tier in ('free', 'pro', 'agency')),
  constraint workspace_subscriptions_status_check check (status in (
    'none', 'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused'
  ))
);

create index if not exists workspace_subscriptions_customer_idx
  on public.workspace_subscriptions(stripe_customer_id);

-- 3. Expand workspace_entitlements with tier + quota overrides ---------------
-- Null limit columns mean "use the plan-tier default" resolved in code
-- (lib/billing/plans.ts). Non-null values are explicit per-workspace overrides.

alter table public.workspace_entitlements
  add column if not exists plan_tier text not null default 'free',
  add column if not exists max_team_seats integer,
  add column if not exists max_social_accounts integer,
  add column if not exists ai_generations_per_month integer,
  add column if not exists scheduled_posts_per_month integer,
  add column if not exists max_active_automations integer,
  add column if not exists media_quota_bytes bigint,
  add column if not exists generated_asset_quota_bytes bigint,
  add column if not exists deep_trend_reports_enabled boolean not null default false;

alter table public.workspace_entitlements
  drop constraint if exists workspace_entitlements_plan_tier_check;
alter table public.workspace_entitlements
  add constraint workspace_entitlements_plan_tier_check check (plan_tier in ('free', 'pro', 'agency'));

-- 4. Usage counters (service-role increments, member reads) ------------------

create table if not exists public.workspace_usage_counters (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  metric text not null,
  period_start date not null,
  used bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, metric, period_start),
  constraint workspace_usage_counters_used_check check (used >= 0)
);

-- Atomic increment used by server code; service-role only.
create or replace function public.increment_workspace_usage(
  p_workspace_id uuid,
  p_metric text,
  p_period_start date,
  p_amount bigint default 1
) returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.workspace_usage_counters as c (workspace_id, metric, period_start, used, updated_at)
  values (p_workspace_id, p_metric, p_period_start, greatest(p_amount, 0), now())
  on conflict (workspace_id, metric, period_start)
  do update set used = c.used + greatest(p_amount, 0), updated_at = now()
  returning used;
$$;

revoke execute on function public.increment_workspace_usage(uuid, text, date, bigint) from public;
revoke execute on function public.increment_workspace_usage(uuid, text, date, bigint) from anon;
revoke execute on function public.increment_workspace_usage(uuid, text, date, bigint) from authenticated;
grant execute on function public.increment_workspace_usage(uuid, text, date, bigint) to service_role;

-- 5. Stripe webhook event ledger (idempotency) --------------------------------

create table if not exists public.stripe_webhook_events (
  id text primary key,
  event_type text not null,
  workspace_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint stripe_webhook_events_status_check check (status in ('received', 'processed', 'skipped', 'failed'))
);

create index if not exists stripe_webhook_events_created_idx
  on public.stripe_webhook_events(created_at desc);

-- 6. Retention policy overrides ------------------------------------------------
-- Null day counts mean "use the plan-tier default" resolved in code
-- (supabase/functions/_shared/retention-policy.ts).

create table if not exists public.workspace_retention_policies (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  log_retention_days integer,
  analytics_retention_days integer,
  message_retention_days integer,
  generated_asset_retention_days integer,
  media_retention_days integer,
  audit_log_retention_days integer,
  temp_session_retention_hours integer,
  invite_retention_days integer,
  legal_hold_until timestamptz,
  cleanup_paused_until timestamptz,
  export_requested_at timestamptz,
  export_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. Workspace storage object tracking ----------------------------------------

create table if not exists public.workspace_storage_objects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bucket text not null,
  object_path text not null,
  source_table text,
  source_id text,
  content_type text,
  size_bytes bigint,
  public_url text,
  status text not null default 'active',
  delete_attempts integer not null default 0,
  last_delete_error text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_storage_objects_path_unique unique (bucket, object_path),
  constraint workspace_storage_objects_status_check check (status in ('active', 'pending_delete', 'deleted', 'delete_failed'))
);

create index if not exists workspace_storage_objects_workspace_status_idx
  on public.workspace_storage_objects(workspace_id, status);

create index if not exists workspace_storage_objects_pending_delete_idx
  on public.workspace_storage_objects(status, updated_at)
  where status in ('pending_delete', 'delete_failed');

-- 8. Retention cleanup run bookkeeping ----------------------------------------
-- The partial unique index gives the cleanup function an atomic single-runner
-- claim (insert fails while another run is active), matching the claim-locking
-- pattern used by publishing automations.

create table if not exists public.retention_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running',
  dry_run boolean not null default true,
  triggered_by text not null default 'manual',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error text,
  constraint retention_cleanup_runs_status_check check (status in ('running', 'completed', 'failed')),
  constraint retention_cleanup_runs_trigger_check check (triggered_by in ('manual', 'scheduler'))
);

create unique index if not exists retention_cleanup_runs_single_runner_idx
  on public.retention_cleanup_runs((status))
  where status = 'running';

create index if not exists retention_cleanup_runs_started_idx
  on public.retention_cleanup_runs(started_at desc);

-- 9. Row level security ---------------------------------------------------------

alter table public.workspace_billing_customers enable row level security;
alter table public.workspace_subscriptions enable row level security;
alter table public.workspace_usage_counters enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.workspace_retention_policies enable row level security;
alter table public.workspace_storage_objects enable row level security;
alter table public.retention_cleanup_runs enable row level security;

drop policy if exists "Admins can read billing customer" on public.workspace_billing_customers;
create policy "Admins can read billing customer"
  on public.workspace_billing_customers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_billing_customers.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'admin')
    )
  );

drop policy if exists "Members can read workspace subscription" on public.workspace_subscriptions;
create policy "Members can read workspace subscription"
  on public.workspace_subscriptions
  for select
  to authenticated
  using (public.is_member_of(workspace_id));

drop policy if exists "Members can read workspace usage" on public.workspace_usage_counters;
create policy "Members can read workspace usage"
  on public.workspace_usage_counters
  for select
  to authenticated
  using (public.is_member_of(workspace_id));

drop policy if exists "Members can read retention policy" on public.workspace_retention_policies;
create policy "Members can read retention policy"
  on public.workspace_retention_policies
  for select
  to authenticated
  using (public.is_member_of(workspace_id));

drop policy if exists "Admins can read storage objects" on public.workspace_storage_objects;
create policy "Admins can read storage objects"
  on public.workspace_storage_objects
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_storage_objects.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'admin')
    )
  );

-- stripe_webhook_events / retention_cleanup_runs: RLS enabled with no
-- authenticated policies -> service-role access only.

grant select on public.workspace_billing_customers to authenticated;
grant select on public.workspace_subscriptions to authenticated;
grant select on public.workspace_usage_counters to authenticated;
grant select on public.workspace_retention_policies to authenticated;
grant select on public.workspace_storage_objects to authenticated;

grant all on public.workspace_billing_customers to service_role;
grant all on public.workspace_subscriptions to service_role;
grant all on public.workspace_usage_counters to service_role;
grant all on public.stripe_webhook_events to service_role;
grant all on public.workspace_retention_policies to service_role;
grant all on public.workspace_storage_objects to service_role;
grant all on public.retention_cleanup_runs to service_role;

-- 10. brand_assets bucket (audit gap: app uploads to it but no migration creates it).
-- Uploads go through the server admin client only, so no authenticated write
-- policy is added; public read matches how brand asset URLs are served.

insert into storage.buckets (id, name, public)
values ('brand_assets', 'brand_assets', true)
on conflict (id) do nothing;

drop policy if exists "brand_assets: public read" on storage.objects;
create policy "brand_assets: public read"
on storage.objects for select
to public
using (bucket_id = 'brand_assets');

-- 11. updated_at triggers --------------------------------------------------------

drop trigger if exists set_workspace_billing_customers_updated_at on public.workspace_billing_customers;
create trigger set_workspace_billing_customers_updated_at
  before update on public.workspace_billing_customers
  for each row execute function public.update_updated_at_column();

drop trigger if exists set_workspace_subscriptions_updated_at on public.workspace_subscriptions;
create trigger set_workspace_subscriptions_updated_at
  before update on public.workspace_subscriptions
  for each row execute function public.update_updated_at_column();

drop trigger if exists set_workspace_retention_policies_updated_at on public.workspace_retention_policies;
create trigger set_workspace_retention_policies_updated_at
  before update on public.workspace_retention_policies
  for each row execute function public.update_updated_at_column();

drop trigger if exists set_workspace_storage_objects_updated_at on public.workspace_storage_objects;
create trigger set_workspace_storage_objects_updated_at
  before update on public.workspace_storage_objects
  for each row execute function public.update_updated_at_column();
