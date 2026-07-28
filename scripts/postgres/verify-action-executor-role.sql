\set ON_ERROR_STOP on

do $verify$
declare
  role_attributes record;
  required_column text;
begin
  select rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
  into strict role_attributes
  from pg_roles where rolname = current_user;

  if role_attributes.rolsuper or role_attributes.rolcreatedb
     or role_attributes.rolcreaterole or role_attributes.rolreplication
     or role_attributes.rolbypassrls
  then
    raise exception 'Executor login % has a forbidden PostgreSQL capability', current_user;
  end if;

  if not has_schema_privilege(current_user, 'public', 'usage') then
    raise exception 'Executor login % cannot use schema public', current_user;
  end if;
  if has_schema_privilege(current_user, 'public', 'create') then
    raise exception 'Executor login % can create objects in schema public', current_user;
  end if;

  -- Must be able to do its job.
  if not has_table_privilege(current_user, 'public.automation_action_outbox', 'select') then
    raise exception 'Executor login % cannot read the action outbox', current_user;
  end if;
  if not has_function_privilege(
    current_user, 'public.claim_automation_actions(text,integer,integer)', 'execute'
  ) then
    raise exception 'Executor login % cannot claim actions', current_user;
  end if;
  if not has_column_privilege(current_user, 'public.social_accounts', 'access_token', 'select') then
    raise exception 'Executor login % cannot read the access token it needs to send', current_user;
  end if;

  foreach required_column in array array[
    'status', 'attempt_count', 'available_at', 'locked_by',
    'provider_response_id', 'last_error_code', 'suppressed_reason', 'processed_at'
  ]
  loop
    if not has_column_privilege(
      current_user, 'public.automation_action_outbox', required_column, 'update'
    ) then
      raise exception 'Executor login % cannot update required column %', current_user, required_column;
    end if;
  end loop;

  -- Must NOT be able to exceed it.
  if exists (
    select 1 from unnest(array['insert','delete','truncate']) as forbidden(privilege)
    where has_table_privilege(current_user, 'public.automation_action_outbox', forbidden.privilege)
  ) then
    raise exception 'Executor login % can create or destroy outbox rows', current_user;
  end if;

  if has_column_privilege(current_user, 'public.social_accounts', 'refresh_token', 'select') then
    raise exception 'Executor login % can read refresh tokens', current_user;
  end if;

  if has_table_privilege(current_user, 'public.webhook_inbox_events', 'select') then
    raise exception 'Executor login % can read the webhook inbox', current_user;
  end if;

  if has_table_privilege(current_user, 'public.workspaces', 'select') then
    raise exception 'Executor login % can read workspaces unexpectedly', current_user;
  end if;
end
$verify$;

select current_user as verified_executor_login;
