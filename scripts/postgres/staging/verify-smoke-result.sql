\set ON_ERROR_STOP on

do $verify$
declare
  smoke record;
begin
  select status, result
  into strict smoke
  from public.webhook_inbox_events
  where provider = 'meta'
    and provider_event_key = 'staging:synthetic:comment:1';

  if smoke.status <> 'succeeded' then
    raise exception 'Synthetic staging event status is %, expected succeeded', smoke.status;
  end if;

  if smoke.result ->> 'sideEffectsExecuted' <> 'false' then
    raise exception 'Synthetic staging event did not prove zero side effects';
  end if;

  if not (
    smoke.result -> 'matchedAutomationIds'
    @> '["10000000-0000-4000-8000-000000000003"]'::jsonb
  ) then
    raise exception 'Synthetic staging event did not match the expected automation';
  end if;
end
$verify$;

select
  provider_event_key,
  status,
  result ->> 'candidateCount' as candidate_count,
  result -> 'matchedAutomationIds' as matched_automation_ids,
  result ->> 'sideEffectsExecuted' as side_effects_executed
from public.webhook_inbox_events
where provider = 'meta'
  and provider_event_key = 'staging:synthetic:comment:1';
