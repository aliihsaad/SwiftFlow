\set ON_ERROR_STOP on

do $verify$
declare
  role_attributes record;
  required_column text;
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
    raise exception 'Worker login % has a forbidden PostgreSQL capability', current_user;
  end if;

  if not has_schema_privilege(current_user, 'public', 'usage') then
    raise exception 'Worker login % cannot use schema public', current_user;
  end if;

  if has_schema_privilege(current_user, 'public', 'create') then
    raise exception 'Worker login % can create objects in schema public', current_user;
  end if;

  if not has_table_privilege(
    current_user,
    'public.webhook_inbox_events',
    'select'
  ) then
    raise exception 'Worker login % cannot read the webhook inbox', current_user;
  end if;

  foreach required_column in array array[
    'status',
    'workspace_id',
    'social_account_id',
    'result',
    'attempt_count',
    'available_at',
    'locked_at',
    'lock_expires_at',
    'locked_by',
    'last_error_code',
    'last_error_message',
    'processed_at',
    'updated_at'
  ]
  loop
    if not has_column_privilege(
      current_user,
      'public.webhook_inbox_events',
      required_column,
      'update'
    ) then
      raise exception
        'Worker login % cannot update required inbox column %',
        current_user,
        required_column;
    end if;
  end loop;

  foreach required_column in array array[
    'id',
    'workspace_id',
    'account_id',
    'metadata'
  ]
  loop
    if not has_column_privilege(
      current_user,
      'public.social_accounts',
      required_column,
      'select'
    ) then
      raise exception
        'Worker login % cannot read required social_accounts column %',
        current_user,
        required_column;
    end if;
  end loop;

  foreach required_column in array array[
    'id',
    'workspace_id',
    'social_account_id',
    'is_active',
    'editor_version',
    'workflow_graph',
    'created_at'
  ]
  loop
    if not has_column_privilege(
      current_user,
      'public.automations',
      required_column,
      'select'
    ) then
      raise exception
        'Worker login % cannot read required automations column %',
        current_user,
        required_column;
    end if;
  end loop;

  if
    has_column_privilege(
      current_user,
      'public.social_accounts',
      'access_token',
      'select'
    )
    or has_column_privilege(
      current_user,
      'public.social_accounts',
      'refresh_token',
      'select'
    )
  then
    raise exception 'Worker login % can read social-account tokens', current_user;
  end if;

  if not has_function_privilege(
    current_user,
    'public.claim_webhook_inbox_events(text,integer,integer)',
    'execute'
  ) then
    raise exception 'Worker login % cannot execute the inbox claim function', current_user;
  end if;

  if exists (
    select 1
    from unnest(array[
      'insert',
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
    raise exception 'Worker login % has forbidden inbox privileges', current_user;
  end if;

  if has_table_privilege(current_user, 'public.workspaces', 'select') then
    raise exception 'Worker login % can read workspaces unexpectedly', current_user;
  end if;
end
$verify$;

select current_user as verified_worker_login;
