-- Out-of-order Stripe webhook protection: record the Stripe event timestamp
-- that last wrote each subscription row so older (delayed/retried) events
-- can never overwrite newer state.

alter table public.workspace_subscriptions
  add column if not exists last_stripe_event_at timestamptz;

-- Per-workspace override for how many workspaces the owning user may create
-- (null = plan-tier default; the effective value is the max across the
-- user's owned workspaces).
alter table public.workspace_entitlements
  add column if not exists max_workspaces integer;
