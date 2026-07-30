-- Least-privilege capability role for the side-effect-free comparison worker.
-- Deployment-specific LOGIN roles inherit this NOLOGIN role; passwords and
-- connection strings never belong in migrations.

do $$
begin
  if not exists (
    select 1
    from pg_roles
    where rolname = 'swiftflow_webhook_comparison'
  ) then
    create role swiftflow_webhook_comparison nologin;
  end if;

  -- Managed Supabase's postgres role is intentionally not a superuser, so it
  -- cannot change SUPERUSER, REPLICATION, or BYPASSRLS with ALTER ROLE.
  -- CREATE ROLE already defaults to nologin, nosuperuser, nocreatedb,
  -- nocreaterole, noreplication, and nobypassrls. Validate those defaults and
  -- fail closed if a pre-existing role is broader.
  if exists (
    select 1
    from pg_roles
    where rolname = 'swiftflow_webhook_comparison'
      and (
        rolcanlogin
        or rolsuper
        or rolcreatedb
        or rolcreaterole
        or rolreplication
        or rolbypassrls
      )
  ) then
    raise exception
      'Role swiftflow_webhook_comparison has unsafe attributes; refusing to continue';
  end if;
end
$$;

revoke all on schema public from swiftflow_webhook_comparison;
grant usage on schema public to swiftflow_webhook_comparison;

revoke all privileges
  on table public.webhook_inbox_events
  from swiftflow_webhook_comparison;
revoke all privileges
  on table public.social_accounts
  from swiftflow_webhook_comparison;
revoke all privileges
  on table public.automations
  from swiftflow_webhook_comparison;

grant select
  on table public.webhook_inbox_events
  to swiftflow_webhook_comparison;
grant update (
  status,
  workspace_id,
  social_account_id,
  result,
  attempt_count,
  available_at,
  locked_at,
  lock_expires_at,
  locked_by,
  last_error_code,
  last_error_message,
  processed_at,
  updated_at
)
  on table public.webhook_inbox_events
  to swiftflow_webhook_comparison;
grant select (
  id,
  workspace_id,
  account_id,
  metadata
)
  on table public.social_accounts
  to swiftflow_webhook_comparison;
grant select (
  id,
  workspace_id,
  social_account_id,
  is_active,
  editor_version,
  workflow_graph,
  created_at
)
  on table public.automations
  to swiftflow_webhook_comparison;

revoke all privileges
  on function public.claim_webhook_inbox_events(text, integer, integer)
  from swiftflow_webhook_comparison;
grant execute
  on function public.claim_webhook_inbox_events(text, integer, integer)
  to swiftflow_webhook_comparison;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'webhook_inbox_events'
      and policyname = 'webhook_comparison_worker_select'
  ) then
    create policy webhook_comparison_worker_select
      on public.webhook_inbox_events
      for select
      to swiftflow_webhook_comparison
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'webhook_inbox_events'
      and policyname = 'webhook_comparison_worker_update'
  ) then
    create policy webhook_comparison_worker_update
      on public.webhook_inbox_events
      for update
      to swiftflow_webhook_comparison
      using (true)
      with check (
        status in (
          'pending',
          'processing',
          'retry_scheduled',
          'succeeded',
          'ignored',
          'dead_letter'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'social_accounts'
      and policyname = 'webhook_comparison_worker_select'
  ) then
    create policy webhook_comparison_worker_select
      on public.social_accounts
      for select
      to swiftflow_webhook_comparison
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'automations'
      and policyname = 'webhook_comparison_worker_select'
  ) then
    create policy webhook_comparison_worker_select
      on public.automations
      for select
      to swiftflow_webhook_comparison
      using (true);
  end if;
end
$$;

comment on role swiftflow_webhook_comparison is
  'NOLOGIN capability role for side-effect-free webhook comparison processing';
