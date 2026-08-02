-- Durable, provider-neutral ingress ledger for signed webhook events.
-- This table is additive: the existing synchronous webhook path remains active
-- until a worker has proven lease, retry, and side-effect idempotency behavior.

create table if not exists public.webhook_inbox_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_key text not null,
  provider_object text not null,
  event_type text not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  social_account_id uuid references public.social_accounts(id) on delete set null,
  account_external_id text,
  delivery_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  lock_expires_at timestamptz,
  locked_by text,
  last_error_code text,
  last_error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webhook_inbox_events_provider_key_unique
    unique (provider, provider_event_key),
  constraint webhook_inbox_events_status_check
    check (status in (
      'pending',
      'processing',
      'retry_scheduled',
      'succeeded',
      'ignored',
      'dead_letter'
    )),
  constraint webhook_inbox_events_attempt_count_check
    check (attempt_count >= 0 and max_attempts > 0 and attempt_count <= max_attempts),
  constraint webhook_inbox_events_delivery_hash_check
    check (delivery_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists webhook_inbox_events_ready_idx
  on public.webhook_inbox_events (available_at, received_at)
  where status in ('pending', 'retry_scheduled');

create index if not exists webhook_inbox_events_expired_lease_idx
  on public.webhook_inbox_events (lock_expires_at)
  where status = 'processing';

create index if not exists webhook_inbox_events_account_idx
  on public.webhook_inbox_events (provider, account_external_id, received_at desc);

create index if not exists webhook_inbox_events_workspace_idx
  on public.webhook_inbox_events (workspace_id, received_at desc)
  where workspace_id is not null;

-- Atomically claims new/retryable work and recovers expired leases. The function
-- uses only PostgreSQL primitives so the worker is not tied to a hosted backend.
create or replace function public.claim_webhook_inbox_events(
  p_worker_id text,
  p_batch_size integer default 10,
  p_lease_seconds integer default 60
)
returns setof public.webhook_inbox_events
language sql
as $$
  with exhausted as (
    update public.webhook_inbox_events as event
    set
      status = 'dead_letter',
      locked_at = null,
      lock_expires_at = null,
      locked_by = null,
      last_error_code = 'lease_expired_after_final_attempt',
      last_error_message = 'Worker lease expired after the final permitted attempt.',
      processed_at = now(),
      updated_at = now()
    where event.status = 'processing'
      and event.lock_expires_at <= now()
      and event.attempt_count >= event.max_attempts
    returning event.id
  ),
  candidates as (
    select event.id
    from public.webhook_inbox_events as event
    where event.attempt_count < event.max_attempts
      and (
        (
          event.status in ('pending', 'retry_scheduled')
          and event.available_at <= now()
        )
        or (
          event.status = 'processing'
          and event.lock_expires_at <= now()
        )
      )
    order by event.available_at asc, event.received_at asc
    for update skip locked
    limit greatest(1, least(p_batch_size, 100))
  )
  update public.webhook_inbox_events as event
  set
    status = 'processing',
    attempt_count = event.attempt_count + 1,
    locked_at = now(),
    lock_expires_at = now() + make_interval(secs => greatest(p_lease_seconds, 1)),
    locked_by = p_worker_id,
    updated_at = now()
  from candidates
  where event.id = candidates.id
  returning event.*;
$$;

alter table public.webhook_inbox_events enable row level security;
revoke all on table public.webhook_inbox_events from public;
revoke all on function public.claim_webhook_inbox_events(text, integer, integer) from public;

-- Compatibility grants are conditional so the migration also runs on vanilla
-- PostgreSQL installations that do not define hosted-backend roles.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on table public.webhook_inbox_events to service_role;
    grant execute on function public.claim_webhook_inbox_events(text, integer, integer) to service_role;
  end if;
end
$$;
