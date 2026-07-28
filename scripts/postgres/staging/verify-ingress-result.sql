\set ON_ERROR_STOP on

do $verify$
declare
  ingress_event record;
  stored_rows integer;
begin
  select
    provider,
    provider_object,
    event_type,
    account_external_id,
    delivery_hash,
    payload,
    attempt_count,
    workspace_id,
    social_account_id,
    status,
    result
  into strict ingress_event
  from public.webhook_inbox_events
  where provider = 'meta'
    and provider_event_key
      = 'instagram:17841400000000000:change:comments:staging-ingress-smoke-1';

  if ingress_event.provider_object <> 'instagram'
    or ingress_event.event_type <> 'comments'
  then
    raise exception 'Ingress event was normalized incorrectly';
  end if;

  if ingress_event.account_external_id <> '17841400000000000' then
    raise exception 'Ingress event lost its account identity';
  end if;

  if ingress_event.delivery_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Ingress event has no valid delivery hash';
  end if;

  if ingress_event.payload -> 'change' -> 'value' ->> 'id'
    <> 'staging-ingress-smoke-1'
  then
    raise exception 'Ingress event did not preserve the signed payload';
  end if;

  if ingress_event.status <> 'succeeded' then
    raise exception 'Ingress smoke status is %, expected succeeded', ingress_event.status;
  end if;

  if ingress_event.workspace_id
      <> '10000000-0000-4000-8000-000000000001'
    or ingress_event.social_account_id
      <> '10000000-0000-4000-8000-000000000002'
  then
    raise exception 'Ingress smoke did not resolve the seeded account';
  end if;

  if ingress_event.result ->> 'sideEffectsExecuted' <> 'false' then
    raise exception 'Ingress smoke did not prove zero side effects';
  end if;

  if not (
    ingress_event.result -> 'matchedAutomationIds'
    @> '["10000000-0000-4000-8000-000000000003"]'::jsonb
  ) then
    raise exception 'Ingress smoke did not match the expected automation';
  end if;

  -- A replayed delivery must not create a second row.
  select count(*)
  into stored_rows
  from public.webhook_inbox_events
  where provider = 'meta'
    and provider_event_key
      = 'instagram:17841400000000000:change:comments:staging-ingress-smoke-1';

  if stored_rows <> 1 then
    raise exception 'Ingress replay created % rows, expected 1', stored_rows;
  end if;
end
$verify$;

select
  provider_event_key,
  provider_object,
  event_type,
  account_external_id,
  status,
  attempt_count,
  result ->> 'candidateCount' as candidate_count,
  result -> 'matchedAutomationIds' as matched_automation_ids,
  result ->> 'sideEffectsExecuted' as side_effects_executed
from public.webhook_inbox_events
where provider = 'meta'
  and provider_event_key
      = 'instagram:17841400000000000:change:comments:staging-ingress-smoke-1';
