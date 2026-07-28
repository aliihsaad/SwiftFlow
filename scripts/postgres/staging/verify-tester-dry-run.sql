\set ON_ERROR_STOP on

-- Reports the dry-run outcome for every real event belonging to the seeded
-- Meta tester account. Prints no secrets: token columns are never selected.
--
-- Read as: exactly one row per distinct comment, status succeeded,
-- side_effects_executed false, and the seeded automation in matched_automations.

\echo '== events for the seeded tester account =='
select
  event.provider_event_key,
  event.event_type,
  event.status,
  event.attempt_count,
  event.result ->> 'reason' as reason,
  event.result ->> 'sideEffectsExecuted' as side_effects_executed,
  event.result -> 'matchedAutomationIds' as matched_automations,
  event.result ->> 'candidateCount' as candidates,
  event.received_at
from public.webhook_inbox_events as event
where event.provider = 'meta'
  and event.account_external_id = (
    select account_id from public.social_accounts
    where id = '20000000-0000-4000-8000-000000000002'
  )
order by event.received_at desc;

\echo ''
\echo '== duplicate-delivery check: one row per comment id =='
select
  event.payload -> 'change' -> 'value' ->> 'id' as comment_id,
  count(*) as stored_rows,
  sum(event.attempt_count) as total_claims
from public.webhook_inbox_events as event
where event.provider = 'meta'
  and event.account_external_id = (
    select account_id from public.social_accounts
    where id = '20000000-0000-4000-8000-000000000002'
  )
group by 1
order by 1;

\echo ''
\echo '== assertions =='
do $verify$
declare
  external_id text;
  total integer;
  duplicated integer;
  side_effects integer;
begin
  select account_id into strict external_id
  from public.social_accounts
  where id = '20000000-0000-4000-8000-000000000002';

  select count(*) into total
  from public.webhook_inbox_events
  where provider = 'meta' and account_external_id = external_id;

  if total = 0 then
    raise notice 'No events yet for the tester account. Nothing to assert.';
    return;
  end if;

  -- A single comment must never be stored twice.
  select count(*) into duplicated from (
    select payload -> 'change' -> 'value' ->> 'id' as comment_id
    from public.webhook_inbox_events
    where provider = 'meta' and account_external_id = external_id
    group by 1
    having count(*) > 1
  ) as repeated;

  if duplicated > 0 then
    raise exception 'Duplicate deliveries created % duplicated comment rows', duplicated;
  end if;

  -- No comparison run may ever report a provider side effect.
  select count(*) into side_effects
  from public.webhook_inbox_events
  where provider = 'meta'
    and account_external_id = external_id
    and coalesce(result ->> 'sideEffectsExecuted', 'false') <> 'false';

  if side_effects > 0 then
    raise exception 'A comparison run reported side effects on % rows', side_effects;
  end if;

  raise notice 'OK: % event(s), no duplicated comments, zero side effects.', total;
end
$verify$;
