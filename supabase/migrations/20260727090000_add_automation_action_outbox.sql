-- Durable outbox for automation provider actions.
--
-- Every external side effect an automation wants to perform is first appended
-- here by the (side-effect-free) comparison path, then executed by a separate,
-- explicitly gated worker. The unique identity below is what makes a duplicate
-- webhook delivery incapable of producing a duplicate provider send: replaying
-- the same event recomputes the same identity and the insert is skipped.

create table if not exists public.automation_action_outbox (
  id uuid primary key default gen_random_uuid(),

  -- Deterministic idempotency identity.
  provider text not null,
  provider_event_key text not null,
  automation_id uuid not null,
  workflow_version_id text not null,
  node_id text not null,
  action_type text not null,
  target_id text not null,

  -- Ownership and routing.
  workspace_id uuid references public.workspaces(id) on delete set null,
  social_account_id uuid references public.social_accounts(id) on delete set null,

  -- Action payload, already rendered by the comparison path. Never contains a
  -- provider token: the executor resolves credentials itself at send time.
  action_payload jsonb not null default '{}'::jsonb,

  status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),

  locked_at timestamptz,
  lock_expires_at timestamptz,
  locked_by text,

  -- Redacted execution audit. provider_response holds identifiers and safe
  -- metadata only; the executor is responsible for stripping payload echoes.
  provider_response_id text,
  provider_response jsonb not null default '{}'::jsonb,
  last_error_code text,
  last_error_message text,
  suppressed_reason text,

  first_attempted_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint automation_action_outbox_identity_unique unique (
    provider,
    provider_event_key,
    automation_id,
    workflow_version_id,
    node_id,
    action_type,
    target_id
  ),
  constraint automation_action_outbox_status_check
    check (status in (
      'pending',
      'claimed',
      'succeeded',
      'retry_scheduled',
      'dead_lettered',
      'suppressed'
    )),
  constraint automation_action_outbox_attempts_check
    check (attempt_count >= 0 and max_attempts > 0 and attempt_count <= max_attempts)
);

create index if not exists automation_action_outbox_ready_idx
  on public.automation_action_outbox (available_at, created_at)
  where status in ('pending', 'retry_scheduled');

create index if not exists automation_action_outbox_expired_lease_idx
  on public.automation_action_outbox (lock_expires_at)
  where status = 'claimed';

create index if not exists automation_action_outbox_account_idx
  on public.automation_action_outbox (social_account_id, created_at desc)
  where social_account_id is not null;

create index if not exists automation_action_outbox_event_idx
  on public.automation_action_outbox (provider, provider_event_key);

-- Atomically claims due work and recovers leases abandoned by a crashed worker.
-- Mirrors the durable inbox claim so both queues behave identically under
-- restart, and uses only PostgreSQL primitives.
create or replace function public.claim_automation_actions(
  p_worker_id text,
  p_batch_size integer default 5,
  p_lease_seconds integer default 60
)
returns setof public.automation_action_outbox
language sql
as $$
  with exhausted as (
    update public.automation_action_outbox as action
    set
      status = 'dead_lettered',
      locked_at = null,
      lock_expires_at = null,
      locked_by = null,
      last_error_code = 'lease_expired_after_final_attempt',
      last_error_message = 'Executor lease expired after the final permitted attempt.',
      processed_at = now(),
      updated_at = now()
    where action.status = 'claimed'
      and action.lock_expires_at <= now()
      and action.attempt_count >= action.max_attempts
    returning action.id
  ),
  candidates as (
    select action.id
    from public.automation_action_outbox as action
    where action.attempt_count < action.max_attempts
      and (
        (
          action.status in ('pending', 'retry_scheduled')
          and action.available_at <= now()
        )
        or (
          action.status = 'claimed'
          and action.lock_expires_at <= now()
        )
      )
    order by action.available_at asc, action.created_at asc
    for update skip locked
    limit greatest(1, least(p_batch_size, 50))
  )
  update public.automation_action_outbox as action
  set
    status = 'claimed',
    attempt_count = action.attempt_count + 1,
    locked_at = now(),
    lock_expires_at = now() + make_interval(secs => greatest(p_lease_seconds, 1)),
    locked_by = p_worker_id,
    first_attempted_at = coalesce(action.first_attempted_at, now()),
    updated_at = now()
  from candidates
  where action.id = candidates.id
  returning action.*;
$$;

alter table public.automation_action_outbox enable row level security;
revoke all on table public.automation_action_outbox from public;
revoke all on function public.claim_automation_actions(text, integer, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on table public.automation_action_outbox to service_role;
    grant execute on function public.claim_automation_actions(text, integer, integer) to service_role;
  end if;
end
$$;

-- The comparison worker may only APPEND intended actions. It must never read
-- back, mutate, claim, or execute one, and it gains no credential access from
-- being able to enqueue.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'swiftflow_webhook_comparison') then
    revoke all privileges
      on table public.automation_action_outbox
      from swiftflow_webhook_comparison;

    grant insert (
      provider,
      provider_event_key,
      automation_id,
      workflow_version_id,
      node_id,
      action_type,
      target_id,
      workspace_id,
      social_account_id,
      action_payload
    )
      on table public.automation_action_outbox
      to swiftflow_webhook_comparison;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'automation_action_outbox'
        and policyname = 'automation_action_outbox_comparison_insert'
    ) then
      create policy automation_action_outbox_comparison_insert
        on public.automation_action_outbox
        for insert
        to swiftflow_webhook_comparison
        with check (
          status = 'pending'
          and attempt_count = 0
          and locked_by is null
          and processed_at is null
          and provider_response_id is null
          and suppressed_reason is null
        );
    end if;
  end if;
end
$$;

comment on table public.automation_action_outbox is
  'Durable, idempotent ledger of intended automation provider actions. Enqueued by the side-effect-free comparison path, executed only by the gated action executor.';
