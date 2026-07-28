-- Capability role for the gated automation action executor.
--
-- This is the ONLY role in the staging topology permitted to read provider
-- credentials, and it exists precisely so that the ingress and comparison roles
-- never need them. It can claim and finalise outbox rows but cannot append one:
-- enqueueing stays with the comparison path, execution stays here.
--
-- Deployment-specific LOGIN roles inherit this NOLOGIN role; passwords and
-- connection strings never belong in migrations.

do $$
begin
  if not exists (
    select 1 from pg_roles where rolname = 'swiftflow_action_executor'
  ) then
    create role swiftflow_action_executor nologin;
  end if;
end
$$;

alter role swiftflow_action_executor
  nologin
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls;

revoke all on schema public from swiftflow_action_executor;
grant usage on schema public to swiftflow_action_executor;

revoke all privileges
  on table public.automation_action_outbox
  from swiftflow_action_executor;
revoke all privileges
  on table public.social_accounts
  from swiftflow_action_executor;
revoke all privileges
  on table public.automations
  from swiftflow_action_executor;
revoke all privileges
  on table public.webhook_inbox_events
  from swiftflow_action_executor;

grant select on table public.automation_action_outbox to swiftflow_action_executor;
grant update (
  status,
  attempt_count,
  available_at,
  locked_at,
  lock_expires_at,
  locked_by,
  provider_response_id,
  provider_response,
  last_error_code,
  last_error_message,
  suppressed_reason,
  first_attempted_at,
  processed_at,
  updated_at
)
  on table public.automation_action_outbox
  to swiftflow_action_executor;

grant execute
  on function public.claim_automation_actions(text, integer, integer)
  to swiftflow_action_executor;

-- Credential access is deliberate and scoped to this role alone. The refresh
-- token stays out of reach: the executor sends, it does not manage token
-- lifecycle.
grant select (
  id,
  workspace_id,
  account_id,
  access_token,
  metadata
)
  on table public.social_accounts
  to swiftflow_action_executor;

-- Needed for the per-automation activation gate.
grant select (
  id,
  workspace_id,
  social_account_id,
  is_active,
  editor_version
)
  on table public.automations
  to swiftflow_action_executor;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'automation_action_outbox'
      and policyname = 'automation_action_outbox_executor_select'
  ) then
    create policy automation_action_outbox_executor_select
      on public.automation_action_outbox
      for select
      to swiftflow_action_executor
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'automation_action_outbox'
      and policyname = 'automation_action_outbox_executor_update'
  ) then
    create policy automation_action_outbox_executor_update
      on public.automation_action_outbox
      for update
      to swiftflow_action_executor
      using (true)
      with check (
        status in (
          'pending',
          'claimed',
          'succeeded',
          'retry_scheduled',
          'dead_lettered',
          'suppressed'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'social_accounts'
      and policyname = 'automation_action_executor_select'
  ) then
    create policy automation_action_executor_select
      on public.social_accounts
      for select
      to swiftflow_action_executor
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'automations'
      and policyname = 'automation_action_executor_select'
  ) then
    create policy automation_action_executor_select
      on public.automations
      for select
      to swiftflow_action_executor
      using (true);
  end if;
end
$$;

comment on role swiftflow_action_executor is
  'NOLOGIN capability role for the gated automation action executor; the only role permitted to read provider access tokens';
