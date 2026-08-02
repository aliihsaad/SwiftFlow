-- Immutable per-node automation execution timeline and guarded action replay.
--
-- Graph workers append started/final events for every visited node. The
-- provider-action outbox appends one started/final event per claimed attempt.
-- Inputs and outputs stored here must already be redacted by the caller; the
-- provider outbox itself is credential-free by contract.

create table if not exists public.automation_execution_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  workspace_id uuid not null,
  automation_id uuid not null,
  workflow_version_id uuid,
  run_id uuid,
  scheduled_execution_id uuid,
  action_outbox_id uuid,
  provider_event_key text,
  source text not null,
  event_type text not null,
  node_id text not null,
  node_type text not null,
  attempt_number integer not null default 1,
  replay_number integer not null default 0,
  input_redacted jsonb not null default '{}'::jsonb,
  output_redacted jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  duration_ms integer,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint automation_execution_events_source_check
    check (source in ('graph', 'provider_action')),
  constraint automation_execution_events_type_check
    check (event_type in (
      'started',
      'succeeded',
      'failed',
      'retry_scheduled',
      'dead_lettered',
      'suppressed',
      'replay_requested'
    )),
  constraint automation_execution_events_attempt_check
    check (attempt_number >= 0 and replay_number >= 0),
  constraint automation_execution_events_duration_check
    check (duration_ms is null or duration_ms >= 0)
);

create index if not exists automation_execution_events_automation_created_idx
  on public.automation_execution_events (automation_id, created_at desc);
create index if not exists automation_execution_events_run_created_idx
  on public.automation_execution_events (run_id, created_at)
  where run_id is not null;
create index if not exists automation_execution_events_action_created_idx
  on public.automation_execution_events (action_outbox_id, created_at)
  where action_outbox_id is not null;
create index if not exists automation_execution_events_workspace_created_idx
  on public.automation_execution_events (workspace_id, created_at desc);

create or replace function public.reject_automation_execution_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'automation execution events are immutable';
end
$$;

drop trigger if exists automation_execution_events_immutable
  on public.automation_execution_events;
create trigger automation_execution_events_immutable
before update or delete on public.automation_execution_events
for each row execute function public.reject_automation_execution_event_mutation();

alter table public.automation_execution_events enable row level security;
revoke all on table public.automation_execution_events from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert on table public.automation_execution_events to service_role;
    create policy automation_execution_events_service_insert
      on public.automation_execution_events
      for insert
      to service_role
      with check (true);
  end if;

  if exists (select 1 from pg_roles where rolname = 'swiftflow_action_executor') then
    grant select on table public.automation_execution_events
      to swiftflow_action_executor;
    grant insert (
      event_key,
      workspace_id,
      automation_id,
      workflow_version_id,
      action_outbox_id,
      provider_event_key,
      source,
      event_type,
      node_id,
      node_type,
      attempt_number,
      replay_number,
      input_redacted,
      output_redacted,
      error_code,
      error_message,
      duration_ms
    ) on table public.automation_execution_events
      to swiftflow_action_executor;

    create policy automation_execution_events_executor_select
      on public.automation_execution_events
      for select
      to swiftflow_action_executor
      using (source = 'provider_action');
    create policy automation_execution_events_executor_insert
      on public.automation_execution_events
      for insert
      to swiftflow_action_executor
      with check (
        source = 'provider_action'
        and action_outbox_id is not null
        and run_id is null
        and scheduled_execution_id is null
      );
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on table public.automation_execution_events to authenticated;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.workspace_members') is not null
    and exists (select 1 from pg_roles where rolname = 'authenticated')
  then
    create policy automation_execution_events_workspace_select
      on public.automation_execution_events
      for select
      to authenticated
      using (
        workspace_id in (
          select membership.workspace_id
          from public.workspace_members as membership
          where membership.user_id = auth.uid()
        )
      );
  end if;
end
$$;

alter table public.automation_action_outbox
  add column if not exists timeline_input_redacted jsonb not null default '{}'::jsonb,
  add column if not exists outcome_ambiguous boolean not null default false,
  add column if not exists replay_count integer not null default 0,
  add column if not exists last_replay_requested_at timestamptz,
  add column if not exists last_replay_requested_by uuid,
  add column if not exists last_replay_reason text;

alter table public.automation_action_outbox
  drop constraint if exists automation_action_outbox_replay_count_check;
alter table public.automation_action_outbox
  add constraint automation_action_outbox_replay_count_check
    check (replay_count >= 0);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'swiftflow_webhook_comparison') then
    grant insert (timeline_input_redacted)
      on table public.automation_action_outbox
      to swiftflow_webhook_comparison;
  end if;

  if exists (select 1 from pg_roles where rolname = 'swiftflow_action_executor') then
    grant update (outcome_ambiguous)
      on table public.automation_action_outbox
      to swiftflow_action_executor;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select (
      id,
      provider,
      provider_event_key,
      automation_id,
      workflow_version_id,
      node_id,
      action_type,
      target_id,
      workspace_id,
      social_account_id,
      status,
      attempt_count,
      max_attempts,
      available_at,
      provider_response_id,
      last_error_code,
      last_error_message,
      suppressed_reason,
      outcome_ambiguous,
      replay_count,
      last_replay_requested_at,
      created_at,
      updated_at
    ) on table public.automation_action_outbox to authenticated;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.workspace_members') is not null
    and exists (select 1 from pg_roles where rolname = 'authenticated')
  then
    create policy automation_action_outbox_workspace_select
      on public.automation_action_outbox
      for select
      to authenticated
      using (
        workspace_id in (
          select membership.workspace_id
          from public.workspace_members as membership
          where membership.user_id = auth.uid()
        )
      );
  end if;
end
$$;

-- Claiming is also the durable start event for an action attempt. Expired final
-- leases receive a terminal event because their delivery outcome is ambiguous.
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
      outcome_ambiguous = true,
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
    returning action.*
  ),
  exhausted_events as (
    insert into public.automation_execution_events (
      event_key,
      workspace_id,
      automation_id,
      workflow_version_id,
      action_outbox_id,
      provider_event_key,
      source,
      event_type,
      node_id,
      node_type,
      attempt_number,
      replay_number,
      input_redacted,
      error_code,
      error_message
    )
    select
      'provider-action:' || action.id || ':attempt:' || action.attempt_count || ':dead-lettered',
      action.workspace_id,
      action.automation_id,
      action.workflow_version_id,
      action.id,
      action.provider_event_key,
      'provider_action',
      'dead_lettered',
      action.node_id,
      action.action_type,
      action.attempt_count,
      action.replay_count,
      action.timeline_input_redacted,
      action.last_error_code,
      action.last_error_message
    from exhausted as action
    where action.workspace_id is not null
    on conflict (event_key) do nothing
    returning id
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
  ),
  claimed as (
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
    returning action.*
  ),
  claimed_events as (
    insert into public.automation_execution_events (
      event_key,
      workspace_id,
      automation_id,
      workflow_version_id,
      action_outbox_id,
      provider_event_key,
      source,
      event_type,
      node_id,
      node_type,
      attempt_number,
      replay_number,
      input_redacted
    )
    select
      'provider-action:' || action.id || ':attempt:' || action.attempt_count || ':started',
      action.workspace_id,
      action.automation_id,
      action.workflow_version_id,
      action.id,
      action.provider_event_key,
      'provider_action',
      'started',
      action.node_id,
      action.action_type,
      action.attempt_count,
      action.replay_count,
      action.timeline_input_redacted
    from claimed as action
    where action.workspace_id is not null
    on conflict (event_key) do nothing
    returning id
  )
  select claimed.* from claimed;
$$;

revoke all on function public.claim_automation_actions(text, integer, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_automation_actions(text, integer, integer)
      to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'swiftflow_action_executor') then
    grant execute on function public.claim_automation_actions(text, integer, integer)
      to swiftflow_action_executor;
  end if;
end
$$;

-- Explicit operator replay. The app authorizes owner/admin access before using
-- this service-only function. Ambiguous deliveries are never eligible.
create or replace function public.request_automation_action_replay(
  p_action_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_reason text default null
)
returns table (
  action_id uuid,
  status text,
  replay_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  action public.automation_action_outbox%rowtype;
  next_replay integer;
  bounded_reason text;
begin
  select *
  into action
  from public.automation_action_outbox
  where id = p_action_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'automation action not found' using errcode = 'P0002';
  end if;

  if action.status not in ('suppressed', 'dead_lettered') then
    raise exception 'only suppressed or dead-lettered actions can be replayed';
  end if;

  if action.status = 'dead_lettered'
    and (
      action.outcome_ambiguous
      or coalesce(action.last_error_code, '') in (
        'request_timeout',
        'network_failure',
        'lease_expired_after_final_attempt'
      )
    )
  then
    raise exception 'ambiguous provider outcomes cannot be replayed safely';
  end if;

  next_replay := action.replay_count + 1;
  bounded_reason := left(
    coalesce(nullif(regexp_replace(p_reason, '\s+', ' ', 'g'), ''), 'Manual replay requested'),
    500
  );

  insert into public.automation_execution_events (
    event_key,
    workspace_id,
    automation_id,
    workflow_version_id,
    action_outbox_id,
    provider_event_key,
    source,
    event_type,
    node_id,
    node_type,
    attempt_number,
    replay_number,
    input_redacted,
    output_redacted,
    error_code,
    error_message,
    actor_user_id
  ) values (
    'provider-action:' || action.id || ':replay:' || next_replay,
    action.workspace_id,
    action.automation_id,
    action.workflow_version_id,
    action.id,
    action.provider_event_key,
    'provider_action',
    'replay_requested',
    action.node_id,
    action.action_type,
    action.attempt_count,
    next_replay,
    action.timeline_input_redacted,
    jsonb_build_object(
      'previous_status', action.status,
      'previous_error_code', action.last_error_code
    ),
    action.last_error_code,
    bounded_reason,
    p_actor_user_id
  );

  update public.automation_action_outbox
  set
    status = 'pending',
    attempt_count = 0,
    available_at = now(),
    locked_at = null,
    lock_expires_at = null,
    locked_by = null,
    provider_response_id = null,
    provider_response = '{}'::jsonb,
    last_error_code = null,
    last_error_message = null,
    suppressed_reason = null,
    outcome_ambiguous = false,
    first_attempted_at = null,
    processed_at = null,
    replay_count = next_replay,
    last_replay_requested_at = now(),
    last_replay_requested_by = p_actor_user_id,
    last_replay_reason = bounded_reason,
    updated_at = now()
  where id = action.id;

  return query
    select replayed.id, replayed.status, replayed.replay_count
    from public.automation_action_outbox as replayed
    where replayed.id = action.id;
end
$$;

revoke all on function public.request_automation_action_replay(uuid, uuid, uuid, text)
  from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute
      on function public.request_automation_action_replay(uuid, uuid, uuid, text)
      to service_role;
  end if;
end
$$;

comment on table public.automation_execution_events is
  'Append-only, redacted per-node and provider-action attempt timeline for automation operations.';
