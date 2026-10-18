-- Smooth provider-send allowances instead of waking the entire backlog hourly.
-- Same configured capacity and refill rate (default 60 actions / 3600 seconds).
-- This is a token bucket, not a strict rolling-hour cap. AI and circuit breakers
-- keep their existing behavior. No execution/queue tables or provider calls.
create table public.automation_provider_send_tokens (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope_kind text not null check (scope_kind in ('account', 'automation')),
  scope_id uuid not null,
  available_tokens numeric not null check (available_tokens >= 0),
  budget_limit integer not null check (budget_limit > 0),
  window_seconds integer not null check (window_seconds between 1 and 86400),
  refilled_at timestamptz not null,
  primary key (workspace_id, scope_kind, scope_id)
);
alter table public.automation_provider_send_tokens enable row level security;
revoke all on public.automation_provider_send_tokens from public, anon, authenticated;
grant all on public.automation_provider_send_tokens to service_role;

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
  v_account_tokens numeric;
  v_automation_tokens numeric;
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
  if p_resource_kind is null or p_resource_kind not in ('provider_send', 'ai_generation') then
    raise exception 'unsupported automation runtime resource: %', p_resource_kind;
  end if;
  if p_account_limit is null or p_automation_limit is null or p_account_limit < 1 or p_automation_limit < 1 then
    raise exception 'automation runtime limits must be positive';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'automation runtime window must be between 1 and 86400 seconds';
  end if;
  if p_cooldown_seconds is null or p_cooldown_seconds < 1 or p_cooldown_seconds > 86400 then
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

  -- Sample after waiting for the distributed locks, never before.
  v_now := clock_timestamp();
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

  if p_resource_kind = 'provider_send' then
    -- First use carries over the current fixed-window usage. A deployment must
    -- not reset an exhausted allowance or release another immediate burst.
    insert into public.automation_provider_send_tokens as bucket
      (workspace_id, scope_kind, scope_id, available_tokens, budget_limit, window_seconds, refilled_at)
    values
      (p_workspace_id, 'account', p_social_account_id, greatest(p_account_limit - v_account_used, 0), p_account_limit, p_window_seconds, v_now),
      (p_workspace_id, 'automation', p_automation_id, greatest(p_automation_limit - v_automation_used, 0), p_automation_limit, p_window_seconds, v_now)
    on conflict (workspace_id, scope_kind, scope_id) do update set
      available_tokens = least(excluded.budget_limit::numeric,
        bucket.available_tokens + greatest(extract(epoch from (v_now - bucket.refilled_at)), 0)
          * least(bucket.budget_limit::numeric / bucket.window_seconds,
                  excluded.budget_limit::numeric / excluded.window_seconds)),
      budget_limit = excluded.budget_limit,
      window_seconds = excluded.window_seconds,
      refilled_at = greatest(bucket.refilled_at, v_now);

    select available_tokens into v_account_tokens
    from public.automation_provider_send_tokens
    where workspace_id = p_workspace_id and scope_kind = 'account' and scope_id = p_social_account_id;
    select available_tokens into v_automation_tokens
    from public.automation_provider_send_tokens
    where workspace_id = p_workspace_id and scope_kind = 'automation' and scope_id = p_automation_id;
    -- Reuse the existing decision/circuit contract; fixed buckets remain usage
    -- counters for provider_send. AI retains its original fixed-window policy.
    v_account_used := p_account_limit - floor(v_account_tokens)::integer;
    v_automation_used := p_automation_limit - floor(v_automation_tokens)::integer;
  end if;

  if v_account_used >= p_account_limit then
    v_retry_after := case when p_resource_kind = 'provider_send'
      then greatest(ceil((1 - v_account_tokens) * p_window_seconds / p_account_limit)::integer, 1)
      else greatest(ceil(extract(epoch from (
        v_window_started_at + make_interval(secs => p_window_seconds) - v_now
      )))::integer, 1) end;
    return query select
      false,
      'account_budget_exhausted'::text,
      v_retry_after,
      0,
      greatest(p_automation_limit - v_automation_used, 0);
    return;
  end if;

  if v_automation_used >= p_automation_limit then
    v_retry_after := case when p_resource_kind = 'provider_send'
      then greatest(ceil((1 - v_automation_tokens) * p_window_seconds / p_automation_limit)::integer, 1)
      else greatest(ceil(extract(epoch from (
        v_window_started_at + make_interval(secs => p_window_seconds) - v_now
      )))::integer, 1) end;
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

  if p_resource_kind = 'provider_send' then
    update public.automation_provider_send_tokens
    set available_tokens = available_tokens - 1
    where workspace_id = p_workspace_id
      and ((scope_kind = 'account' and scope_id = p_social_account_id)
        or (scope_kind = 'automation' and scope_id = p_automation_id));
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


revoke all on function public.reserve_automation_runtime_budget(uuid,uuid,uuid,text,integer,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.reserve_automation_runtime_budget(uuid,uuid,uuid,text,integer,integer,integer,integer) to service_role;
