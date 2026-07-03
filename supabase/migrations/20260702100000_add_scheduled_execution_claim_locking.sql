-- Atomic claim locking for delayed automation executions.
--
-- Overlapping process-scheduled-executions invocations must not resume the
-- same delayed node twice. Due pending rows are claimed atomically with
-- FOR UPDATE SKIP LOCKED and stamped with a per-invocation claim token,
-- moving them to 'executing' in the same statement. Rows stuck in
-- 'executing' with a stale claim (crashed invocation) become claimable again
-- after the stale-lease timeout. Mirrors claim_due_publishing_automations.

alter table public.automation_scheduled_executions
    add column if not exists claim_token uuid,
    add column if not exists claimed_at timestamptz;

create index if not exists idx_automation_scheduled_executions_due
    on public.automation_scheduled_executions(scheduled_for)
    where status in ('pending', 'executing');

create or replace function public.claim_due_scheduled_executions(
    p_claim_token uuid,
    p_limit integer default 50,
    p_stale_after_minutes integer default 30
)
returns setof public.automation_scheduled_executions
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_claim_token is null then
        raise exception 'p_claim_token is required';
    end if;

    return query
    with due as (
        select se.id
        from public.automation_scheduled_executions se
        where se.scheduled_for <= now()
          and (
              se.status = 'pending'
              or (
                  -- recover stale claims left by invocations that never finalized
                  se.status = 'executing'
                  and se.claimed_at is not null
                  and se.claimed_at <= now() - make_interval(mins => greatest(coalesce(p_stale_after_minutes, 30), 1))
              )
          )
        order by se.scheduled_for asc
        limit least(greatest(coalesce(p_limit, 1), 1), 50)
        for update skip locked
    )
    update public.automation_scheduled_executions target
    set status = 'executing',
        claim_token = p_claim_token,
        claimed_at = now()
    from due
    where target.id = due.id
    returning target.*;
end;
$$;

revoke all on function public.claim_due_scheduled_executions(uuid, integer, integer) from public;
revoke all on function public.claim_due_scheduled_executions(uuid, integer, integer) from anon;
revoke all on function public.claim_due_scheduled_executions(uuid, integer, integer) from authenticated;
grant execute on function public.claim_due_scheduled_executions(uuid, integer, integer) to service_role;
