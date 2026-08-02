-- Least-privilege capability role for the provider-neutral webhook ingress.
-- The ingress verifies signed provider deliveries and appends them to the
-- durable inbox. It must never read, mutate, or claim an existing event, and it
-- must never reach account credentials or automation definitions.
--
-- Deployment-specific LOGIN roles inherit this NOLOGIN role; passwords and
-- connection strings never belong in migrations.

do $$
begin
  if not exists (
    select 1
    from pg_roles
    where rolname = 'swiftflow_webhook_ingress'
  ) then
    create role swiftflow_webhook_ingress nologin;
  end if;

  -- Managed Supabase's postgres role is intentionally not a superuser, so it
  -- cannot change SUPERUSER, REPLICATION, or BYPASSRLS with ALTER ROLE.
  -- CREATE ROLE already defaults to nologin, nosuperuser, nocreatedb,
  -- nocreaterole, noreplication, and nobypassrls. Validate those defaults and
  -- fail closed if a pre-existing role is broader.
  if exists (
    select 1
    from pg_roles
    where rolname = 'swiftflow_webhook_ingress'
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
      'Role swiftflow_webhook_ingress has unsafe attributes; refusing to continue';
  end if;
end
$$;

revoke all on schema public from swiftflow_webhook_ingress;
grant usage on schema public to swiftflow_webhook_ingress;

revoke all privileges
  on table public.webhook_inbox_events
  from swiftflow_webhook_ingress;
revoke all privileges
  on table public.social_accounts
  from swiftflow_webhook_ingress;
revoke all privileges
  on table public.automations
  from swiftflow_webhook_ingress;
revoke all privileges
  on table public.workspaces
  from swiftflow_webhook_ingress;
revoke all privileges
  on function public.claim_webhook_inbox_events(text, integer, integer)
  from swiftflow_webhook_ingress;

-- Column-level insert only. Every omitted column keeps its table default, so
-- the ingress cannot pre-set status, attempts, leases, results, or resolved
-- workspace/account identity.
grant insert (
  provider,
  provider_event_key,
  provider_object,
  event_type,
  account_external_id,
  delivery_hash,
  payload
)
  on table public.webhook_inbox_events
  to swiftflow_webhook_ingress;

-- The insert policy is a second, independent guard: even if the grants above
-- were widened by mistake, a row may only enter the inbox in its initial
-- unclaimed state.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'webhook_inbox_events'
      and policyname = 'webhook_ingress_insert'
  ) then
    create policy webhook_ingress_insert
      on public.webhook_inbox_events
      for insert
      to swiftflow_webhook_ingress
      with check (
        status = 'pending'
        and attempt_count = 0
        and workspace_id is null
        and social_account_id is null
        and locked_by is null
        and locked_at is null
        and lock_expires_at is null
        and processed_at is null
        and last_error_code is null
        and last_error_message is null
        and result = '{}'::jsonb
      );
  end if;
end
$$;

comment on role swiftflow_webhook_ingress is
  'NOLOGIN capability role for append-only signed webhook ingress';
