\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.webhook_inbox_events') is null
    or to_regclass('public.automations') is null
    or to_regclass('public.automation_workflow_versions') is null
    or to_regclass('public.automation_action_outbox') is null
    or to_regclass('public.automation_execution_events') is null
    or to_regclass('public.automation_runtime_budget_buckets') is null
    or to_regclass('public.automation_runtime_circuits') is null
    or to_regprocedure(
      'public.claim_webhook_inbox_events(text,integer,integer)'
    ) is null
    or to_regprocedure(
      'public.claim_automation_actions(text,integer,integer)'
    ) is null
    or to_regprocedure(
      'public.reserve_automation_runtime_budget(uuid,uuid,uuid,text,integer,integer,integer,integer)'
    ) is null
    or to_regprocedure(
      'public.record_automation_runtime_outcome(uuid,uuid,uuid,text,boolean,text,integer,integer)'
    ) is null
  then
    raise exception 'required SwiftFlow schema objects are missing';
  end if;
end
$$;

select jsonb_build_object(
  'database', current_database(),
  'schemaReady', true,
  'webhookInbox', jsonb_build_object(
    'pending', (
      select count(*)
      from public.webhook_inbox_events
      where status in ('pending', 'retry_scheduled', 'claimed')
    ),
    'deadLettered', (
      select count(*)
      from public.webhook_inbox_events
      where status = 'dead_lettered'
    )
  ),
  'actionOutbox', jsonb_build_object(
    'runnable', (
      select count(*)
      from public.automation_action_outbox
      where status in ('pending', 'retry_scheduled', 'claimed')
    ),
    'deadLettered', (
      select count(*)
      from public.automation_action_outbox
      where status = 'dead_lettered'
    ),
    'ambiguous', (
      select count(*)
      from public.automation_action_outbox
      where outcome_ambiguous is true
    )
  ),
  'runtimeCircuits', jsonb_build_object(
    'open', (
      select count(*)
      from public.automation_runtime_circuits
      where circuit_state in ('open', 'half_open')
    )
  )
)::text;
