\set ON_ERROR_STOP on

select jsonb_build_object(
  'formatVersion', 1,
  'requiredObjects', jsonb_build_object(
    'webhookInbox', to_regclass('public.webhook_inbox_events') is not null,
    'automations', to_regclass('public.automations') is not null,
    'workflowVersions', to_regclass('public.automation_workflow_versions') is not null,
    'actionOutbox', to_regclass('public.automation_action_outbox') is not null,
    'executionTimeline', to_regclass('public.automation_execution_events') is not null,
    'runtimeBudgets', to_regclass('public.automation_runtime_budget_buckets') is not null,
    'runtimeCircuits', to_regclass('public.automation_runtime_circuits') is not null,
    'claimInbox', to_regprocedure('public.claim_webhook_inbox_events(text,integer,integer)') is not null,
    'claimActions', to_regprocedure('public.claim_automation_actions(text,integer,integer)') is not null,
    'reserveRuntimeBudget', to_regprocedure(
      'public.reserve_automation_runtime_budget(uuid,uuid,uuid,text,integer,integer,integer,integer)'
    ) is not null,
    'recordRuntimeOutcome', to_regprocedure(
      'public.record_automation_runtime_outcome(uuid,uuid,uuid,text,boolean,text,integer,integer)'
    ) is not null
  ),
  'rowCounts', jsonb_build_object(
    'workspaces', (select count(*) from public.workspaces),
    'socialAccounts', (select count(*) from public.social_accounts),
    'automations', (select count(*) from public.automations),
    'workflowVersions', (select count(*) from public.automation_workflow_versions),
    'webhookInbox', (select count(*) from public.webhook_inbox_events),
    'actionOutbox', (select count(*) from public.automation_action_outbox),
    'executionTimeline', (select count(*) from public.automation_execution_events),
    'runtimeBudgets', (select count(*) from public.automation_runtime_budget_buckets),
    'runtimeCircuits', (select count(*) from public.automation_runtime_circuits)
  )
)::text;
