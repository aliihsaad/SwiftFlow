-- Durable distributed budgets and circuit breakers for automation side effects.
--
-- Every provider-send or automation-AI node consumes one unit from both its
-- social-account scope and its automation scope before it may execute. The
-- reservation and both scope checks happen in one PostgreSQL transaction while
-- holding deterministic advisory locks, so adding worker replicas cannot
-- multiply the configured limits.

create table if not exists public.automation_runtime_budget_buckets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope_kind text not null,
  scope_id uuid not null,
  resource_kind text not null,
  window_started_at timestamptz not null,
  window_seconds integer not null,
  used_units integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (
    workspace_id,
    scope_kind,
    scope_id,
    resource_kind,
    window_started_at,
    window_seconds
  ),
  constraint automation_runtime_budget_scope_check
    check (scope_kind in ('account', 'automation')),
  constraint automation_runtime_budget_resource_check
    check (resource_kind in ('provider_send', 'ai_generation')),
  constraint automation_runtime_budget_window_check
    check (window_seconds between 1 and 86400),
  constraint automation_runtime_budget_units_check
    check (used_units >= 0)
);

create index if not exists automation_runtime_budget_workspace_window_idx
  on public.automation_runtime_budget_buckets (workspace_id, window_started_at desc);

create table if not exists public.automation_runtime_circuits (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope_kind text not null,
  scope_id uuid not null,
  resource_kind text not null,
  circuit_state text not null default 'closed',
  consecutive_failures integer not null default 0,
  opened_at timestamptz,
  retry_at timestamptz,
  last_failure_code text,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, scope_kind, scope_id, resource_kind),
  constraint automation_runtime_circuit_scope_check
    check (scope_kind in ('account', 'automation')),
  constraint automation_runtime_circuit_resource_check
    check (resource_kind in ('provider_send', 'ai_generation')),
  constraint automation_runtime_circuit_state_check
    check (circuit_state in ('closed', 'open', 'half_open')),
  constraint automation_runtime_circuit_failures_check
    check (consecutive_failures >= 0)
);

create index if not exists automation_runtime_circuit_workspace_state_idx
  on public.automation_runtime_circuits (workspace_id, circuit_state, updated_at desc);

alter table public.automation_runtime_budget_buckets enable row level security;
alter table public.automation_runtime_circuits enable row level security;
revoke all on table public.automation_runtime_budget_buckets from public;
revoke all on table public.automation_runtime_circuits from public;

create or replace function public.reserve_automation_runtime_budget(
  p_workspace_id uuid,
  p_social_account_id uuid,
  p_automation_id uuid,
  p_resource_kind text,
  p_account_limit integer,
  p_automation_limit integer,
  p_window_seconds integer,
  p_cooldown_seconds integer
)
returns table (
  allowed boolean,
  reason text,
  retry_after_seconds integer,
  account_remaining integer,
  automation_remaining integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_account_used integer := 0;
  v_automation_used integer := 0;
  v_account_state text;
  v_automation_state text;
  v_account_retry_at timestamptz;
  v_automation_retry_at timestamptz;
  v_retry_after integer := 0;
begin
  if p_workspace_id is null or p_social_account_id is null or p_automation_id is null then
    raise exception 'workspace, social account, and automation ids are required';
  end if;
  if not exists (
    select 1
    from public.social_accounts as account
    join public.automations as automation
      on automation.id = p_automation_id
      and automation.workspace_id = p_workspace_id
      and automation.social_account_id = account.id
    where account.id = p_social_account_id
      and account.workspace_id = p_workspace_id
  ) then
    raise exception 'automation runtime guard scope does not resolve';
  end if;
  if p_resource_kind not in ('provider_send', 'ai_generation') then
    raise exception 'unsupported automation runtime resource: %', p_resource_kind;
  end if;
  if p_account_limit < 1 or p_automation_limit < 1 then
    raise exception 'automation runtime limits must be positive';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'automation runtime window must be between 1 and 86400 seconds';
  end if;
  if p_cooldown_seconds < 1 or p_cooldown_seconds > 86400 then
    raise exception 'automation runtime cooldown must be between 1 and 86400 seconds';
  end if;

  -- All callers lock account first and automation second. This serialises both
  -- shared scopes without turning the guard tables into a global bottleneck.
  perform pg_advisory_xact_lock(hashtextextended(
    p_workspace_id::text || ':account:' || p_social_account_id::text || ':' || p_resource_kind,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_workspace_id::text || ':automation:' || p_automation_id::text || ':' || p_resource_kind,
    0
  ));

  v_window_started_at := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  select bucket.used_units
    into v_account_used
  from public.automation_runtime_budget_buckets as bucket
  where bucket.workspace_id = p_workspace_id
    and bucket.scope_kind = 'account'
    and bucket.scope_id = p_social_account_id
    and bucket.resource_kind = p_resource_kind
    and bucket.window_started_at = v_window_started_at
    and bucket.window_seconds = p_window_seconds;
  v_account_used := coalesce(v_account_used, 0);

  select bucket.used_units
    into v_automation_used
  from public.automation_runtime_budget_buckets as bucket
  where bucket.workspace_id = p_workspace_id
    and bucket.scope_kind = 'automation'
    and bucket.scope_id = p_automation_id
    and bucket.resource_kind = p_resource_kind
    and bucket.window_started_at = v_window_started_at
    and bucket.window_seconds = p_window_seconds;
  v_automation_used := coalesce(v_automation_used, 0);

  if v_account_used >= p_account_limit then
    v_retry_after := greatest(
      ceil(extract(epoch from (
        v_window_started_at + make_interval(secs => p_window_seconds) - v_now
      )))::integer,
      1
    );
    return query select
      false,
      'account_budget_exhausted'::text,
      v_retry_after,
      0,
      greatest(p_automation_limit - v_automation_used, 0);
    return;
  end if;

  if v_automation_used >= p_automation_limit then
    v_retry_after := greatest(
      ceil(extract(epoch from (
        v_window_started_at + make_interval(secs => p_window_seconds) - v_now
      )))::integer,
      1
    );
    return query select
      false,
      'automation_budget_exhausted'::text,
      v_retry_after,
      greatest(p_account_limit - v_account_used, 0),
      0;
    return;
  end if;

  insert into public.automation_runtime_circuits (
    workspace_id, scope_kind, scope_id, resource_kind
  )
  values
    (p_workspace_id, 'account', p_social_account_id, p_resource_kind),
    (p_workspace_id, 'automation', p_automation_id, p_resource_kind)
  on conflict do nothing;

  select circuit.circuit_state, circuit.retry_at
    into v_account_state, v_account_retry_at
  from public.automation_runtime_circuits as circuit
  where circuit.workspace_id = p_workspace_id
    and circuit.scope_kind = 'account'
    and circuit.scope_id = p_social_account_id
    and circuit.resource_kind = p_resource_kind
  for update;

  select circuit.circuit_state, circuit.retry_at
    into v_automation_state, v_automation_retry_at
  from public.automation_runtime_circuits as circuit
  where circuit.workspace_id = p_workspace_id
    and circuit.scope_kind = 'automation'
    and circuit.scope_id = p_automation_id
    and circuit.resource_kind = p_resource_kind
  for update;

  if v_account_state in ('open', 'half_open')
    and v_account_retry_at is not null
    and v_account_retry_at > v_now
  then
    return query select
      false,
      case
        when v_account_state = 'half_open'
          then 'account_circuit_probe_in_flight'
        else 'account_circuit_open'
      end::text,
      greatest(ceil(extract(epoch from (v_account_retry_at - v_now)))::integer, 1),
      greatest(p_account_limit - v_account_used, 0),
      greatest(p_automation_limit - v_automation_used, 0);
    return;
  end if;

  if v_automation_state in ('open', 'half_open')
    and v_automation_retry_at is not null
    and v_automation_retry_at > v_now
  then
    return query select
      false,
      case
        when v_automation_state = 'half_open'
          then 'automation_circuit_probe_in_flight'
        else 'automation_circuit_open'
      end::text,
      greatest(ceil(extract(epoch from (v_automation_retry_at - v_now)))::integer, 1),
      greatest(p_account_limit - v_account_used, 0),
      greatest(p_automation_limit - v_automation_used, 0);
    return;
  end if;

  -- An expired open/half-open circuit permits exactly one probe. Its retry_at
  -- doubles as a probe lease so a crashed probe cannot wedge the circuit.
  if v_account_state in ('open', 'half_open') then
    update public.automation_runtime_circuits
    set
      circuit_state = 'half_open',
      retry_at = v_now + make_interval(secs => p_cooldown_seconds),
      updated_at = v_now
    where workspace_id = p_workspace_id
      and scope_kind = 'account'
      and scope_id = p_social_account_id
      and resource_kind = p_resource_kind;
  end if;

  if v_automation_state in ('open', 'half_open') then
    update public.automation_runtime_circuits
    set
      circuit_state = 'half_open',
      retry_at = v_now + make_interval(secs => p_cooldown_seconds),
      updated_at = v_now
    where workspace_id = p_workspace_id
      and scope_kind = 'automation'
      and scope_id = p_automation_id
      and resource_kind = p_resource_kind;
  end if;

  insert into public.automation_runtime_budget_buckets (
    workspace_id,
    scope_kind,
    scope_id,
    resource_kind,
    window_started_at,
    window_seconds,
    used_units,
    created_at,
    updated_at
  )
  values
    (
      p_workspace_id,
      'account',
      p_social_account_id,
      p_resource_kind,
      v_window_started_at,
      p_window_seconds,
      1,
      v_now,
      v_now
    ),
    (
      p_workspace_id,
      'automation',
      p_automation_id,
      p_resource_kind,
      v_window_started_at,
      p_window_seconds,
      1,
      v_now,
      v_now
    )
  on conflict (
    workspace_id,
    scope_kind,
    scope_id,
    resource_kind,
    window_started_at,
    window_seconds
  )
  do update set
    used_units = public.automation_runtime_budget_buckets.used_units + 1,
    updated_at = excluded.updated_at;

  return query select
    true,
    'allowed'::text,
    0,
    greatest(p_account_limit - v_account_used - 1, 0),
    greatest(p_automation_limit - v_automation_used - 1, 0);
end
$$;

create or replace function public.record_automation_runtime_outcome(
  p_workspace_id uuid,
  p_social_account_id uuid,
  p_automation_id uuid,
  p_resource_kind text,
  p_succeeded boolean,
  p_failure_code text,
  p_failure_threshold integer,
  p_cooldown_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_scope_kind text;
  v_scope_id uuid;
begin
  if p_workspace_id is null or p_social_account_id is null or p_automation_id is null then
    raise exception 'workspace, social account, and automation ids are required';
  end if;
  if not exists (
    select 1
    from public.social_accounts as account
    join public.automations as automation
      on automation.id = p_automation_id
      and automation.workspace_id = p_workspace_id
      and automation.social_account_id = account.id
    where account.id = p_social_account_id
      and account.workspace_id = p_workspace_id
  ) then
    raise exception 'automation runtime guard scope does not resolve';
  end if;
  if p_resource_kind not in ('provider_send', 'ai_generation') then
    raise exception 'unsupported automation runtime resource: %', p_resource_kind;
  end if;
  if p_failure_threshold < 1 or p_failure_threshold > 100 then
    raise exception 'automation runtime failure threshold must be between 1 and 100';
  end if;
  if p_cooldown_seconds < 1 or p_cooldown_seconds > 86400 then
    raise exception 'automation runtime cooldown must be between 1 and 86400 seconds';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_workspace_id::text || ':account:' || p_social_account_id::text || ':' || p_resource_kind,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_workspace_id::text || ':automation:' || p_automation_id::text || ':' || p_resource_kind,
    0
  ));

  for v_scope_kind, v_scope_id in
    select *
    from (values
      ('account'::text, p_social_account_id),
      ('automation'::text, p_automation_id)
    ) as scopes(scope_kind, scope_id)
  loop
    insert into public.automation_runtime_circuits (
      workspace_id, scope_kind, scope_id, resource_kind
    )
    values (p_workspace_id, v_scope_kind, v_scope_id, p_resource_kind)
    on conflict do nothing;

    if p_succeeded then
      update public.automation_runtime_circuits
      set
        circuit_state = case
          when circuit_state in ('closed', 'half_open') then 'closed'
          else circuit_state
        end,
        consecutive_failures = case
          when circuit_state in ('closed', 'half_open') then 0
          else consecutive_failures
        end,
        opened_at = case
          when circuit_state in ('closed', 'half_open') then null
          else opened_at
        end,
        retry_at = case
          when circuit_state in ('closed', 'half_open') then null
          else retry_at
        end,
        last_success_at = v_now,
        updated_at = v_now
      where workspace_id = p_workspace_id
        and scope_kind = v_scope_kind
        and scope_id = v_scope_id
        and resource_kind = p_resource_kind;
    else
      update public.automation_runtime_circuits
      set
        consecutive_failures = case
          when circuit_state in ('open', 'half_open') then p_failure_threshold
          else consecutive_failures + 1
        end,
        circuit_state = case
          when circuit_state in ('open', 'half_open')
            or consecutive_failures + 1 >= p_failure_threshold
            then 'open'
          else 'closed'
        end,
        opened_at = case
          when circuit_state in ('open', 'half_open')
            or consecutive_failures + 1 >= p_failure_threshold
            then coalesce(opened_at, v_now)
          else opened_at
        end,
        retry_at = case
          when circuit_state in ('open', 'half_open')
            or consecutive_failures + 1 >= p_failure_threshold
            then v_now + make_interval(secs => p_cooldown_seconds)
          else null
        end,
        last_failure_code = left(coalesce(nullif(trim(p_failure_code), ''), 'provider_error'), 120),
        last_failure_at = v_now,
        updated_at = v_now
      where workspace_id = p_workspace_id
        and scope_kind = v_scope_kind
        and scope_id = v_scope_id
        and resource_kind = p_resource_kind;
    end if;
  end loop;
end
$$;

revoke all on function public.reserve_automation_runtime_budget(
  uuid, uuid, uuid, text, integer, integer, integer, integer
) from public;
revoke all on function public.record_automation_runtime_outcome(
  uuid, uuid, uuid, text, boolean, text, integer, integer
) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on table public.automation_runtime_budget_buckets to service_role;
    grant select on table public.automation_runtime_circuits to service_role;
    grant execute on function public.reserve_automation_runtime_budget(
      uuid, uuid, uuid, text, integer, integer, integer, integer
    ) to service_role;
    grant execute on function public.record_automation_runtime_outcome(
      uuid, uuid, uuid, text, boolean, text, integer, integer
    ) to service_role;
  end if;

  if exists (select 1 from pg_roles where rolname = 'swiftflow_action_executor') then
    grant execute on function public.reserve_automation_runtime_budget(
      uuid, uuid, uuid, text, integer, integer, integer, integer
    ) to swiftflow_action_executor;
    grant execute on function public.record_automation_runtime_outcome(
      uuid, uuid, uuid, text, boolean, text, integer, integer
    ) to swiftflow_action_executor;
  end if;
end
$$;

comment on table public.automation_runtime_budget_buckets is
  'Durable per-account and per-automation side-effect budget counters';
comment on table public.automation_runtime_circuits is
  'Durable per-account and per-automation provider/AI circuit breaker state';
