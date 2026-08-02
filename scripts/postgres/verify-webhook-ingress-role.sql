\set ON_ERROR_STOP on

do $verify$
declare
  role_attributes record;
  required_column text;
  forbidden_column text;
begin
  select
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolreplication,
    rolbypassrls
  into strict role_attributes
  from pg_roles
  where rolname = current_user;

  if
    role_attributes.rolsuper
    or role_attributes.rolcreatedb
    or role_attributes.rolcreaterole
    or role_attributes.rolreplication
    or role_attributes.rolbypassrls
  then
    raise exception 'Ingress login % has a forbidden PostgreSQL capability', current_user;
  end if;

  if not has_schema_privilege(current_user, 'public', 'usage') then
    raise exception 'Ingress login % cannot use schema public', current_user;
  end if;

  if has_schema_privilege(current_user, 'public', 'create') then
    raise exception 'Ingress login % can create objects in schema public', current_user;
  end if;

  foreach required_column in array array[
    'provider',
    'provider_event_key',
    'provider_object',
    'event_type',
    'account_external_id',
    'delivery_hash',
    'payload'
  ]
  loop
    if not has_column_privilege(
      current_user,
      'public.webhook_inbox_events',
      required_column,
      'insert'
    ) then
      raise exception
        'Ingress login % cannot insert required inbox column %',
        current_user,
        required_column;
    end if;
  end loop;

  -- Lifecycle columns stay at their defaults: the ingress may append an event
  -- but may never declare its status, attempts, lease, or resolved identity.
  foreach forbidden_column in array array[
    'id',
    'status',
    'attempt_count',
    'max_attempts',
    'available_at',
    'workspace_id',
    'social_account_id',
    'result',
    'locked_at',
    'lock_expires_at',
    'locked_by',
    'last_error_code',
    'last_error_message',
    'processed_at'
  ]
  loop
    if has_column_privilege(
      current_user,
      'public.webhook_inbox_events',
      forbidden_column,
      'insert'
    ) then
      raise exception
        'Ingress login % can insert forbidden inbox column %',
        current_user,
        forbidden_column;
    end if;
  end loop;

  if exists (
    select 1
    from unnest(array[
      'select',
      'update',
      'delete',
      'truncate',
      'references',
      'trigger'
    ]) as forbidden(privilege)
    where has_table_privilege(
      current_user,
      'public.webhook_inbox_events',
      forbidden.privilege
    )
  ) then
    raise exception 'Ingress login % has forbidden inbox privileges', current_user;
  end if;

  if
    has_column_privilege(
      current_user,
      'public.webhook_inbox_events',
      'payload',
      'select'
    )
    or has_column_privilege(
      current_user,
      'public.webhook_inbox_events',
      'status',
      'update'
    )
  then
    raise exception 'Ingress login % can read or mutate stored inbox rows', current_user;
  end if;

  if has_function_privilege(
    current_user,
    'public.claim_webhook_inbox_events(text,integer,integer)',
    'execute'
  ) then
    raise exception 'Ingress login % can claim inbox work', current_user;
  end if;

  if
    has_column_privilege(current_user, 'public.social_accounts', 'account_id', 'select')
    or has_column_privilege(current_user, 'public.social_accounts', 'access_token', 'select')
    or has_column_privilege(current_user, 'public.social_accounts', 'refresh_token', 'select')
  then
    raise exception 'Ingress login % can read social accounts', current_user;
  end if;

  if has_column_privilege(
    current_user,
    'public.automations',
    'workflow_graph',
    'select'
  ) then
    raise exception 'Ingress login % can read automation definitions', current_user;
  end if;

  if has_table_privilege(current_user, 'public.workspaces', 'select') then
    raise exception 'Ingress login % can read workspaces unexpectedly', current_user;
  end if;
end
$verify$;

select current_user as verified_ingress_login;
