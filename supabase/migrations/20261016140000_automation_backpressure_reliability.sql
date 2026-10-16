-- Expired leases are uncertain sends, not permission to send again.
create or replace function public.claim_due_scheduled_executions(
  p_claim_token uuid, p_limit integer default 4, p_stale_after_minutes integer default 30
)
returns setof public.automation_scheduled_executions
language plpgsql security definer set search_path = ''
as $$
begin
  if p_claim_token is null then raise exception 'p_claim_token is required'; end if;
  with expired as (
    update public.automation_scheduled_executions
    set status = 'failed', executed_at = now(), claim_token = null, claimed_at = null,
      execution_context = execution_context || jsonb_build_object(
        'resume_error', 'Worker stopped before confirming completion; automatic replay suppressed')
    where status = 'executing'
      and claimed_at <= now() - make_interval(mins => greatest(coalesce(p_stale_after_minutes, 30), 5))
    returning execution_context->>'run_id' as run_id
  )
  update public.automation_runs r
  set status = 'failed', pending_continuation_count = 0,
    error_count = greatest(error_count, 1),
    error_message = 'Scheduled worker stopped before confirming delivery; review required',
    finished_at = now(), updated_at = now()
  where r.id::text in (select run_id from expired);

  return query
  with due as (
    select se.id from public.automation_scheduled_executions se
    where se.status = 'pending' and se.scheduled_for <= now()
      and (
        se.execution_context->>'run_id' is null
        or exists (
          select 1 from public.automation_runs r
          where r.id::text = se.execution_context->>'run_id'
            and r.automation_id = se.automation_id and r.status = 'waiting'
        )
      )
    order by se.scheduled_for, se.id
    limit least(greatest(coalesce(p_limit, 4), 1), 50)
    for update of se skip locked
  )
  update public.automation_scheduled_executions target
  set status = 'executing', claim_token = p_claim_token, claimed_at = now()
  from due where target.id = due.id returning target.*;
end;
$$;
revoke all on function public.claim_due_scheduled_executions(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_executions(uuid, integer, integer) to service_role;

-- Read/modify/write in individual workers loses increments during bursts.
create or replace function public.increment_automation_stats(
  p_workspace_id uuid, p_automation_id uuid, p_triggered integer, p_dms_sent integer
)
returns void language sql security definer set search_path = ''
as $$
  update public.automations
  set total_triggered = coalesce(total_triggered, 0) + greatest(coalesce(p_triggered, 0), 0),
      total_dms_sent = coalesce(total_dms_sent, 0) + greatest(coalesce(p_dms_sent, 0), 0),
      updated_at = now()
  where id = p_automation_id and workspace_id = p_workspace_id;
$$;
revoke all on function public.increment_automation_stats(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.increment_automation_stats(uuid, uuid, integer, integer) to service_role;
