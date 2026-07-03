-- Atomic claim locking for the publishing automation runner.
--
-- Overlapping scheduler-tick invocations must not double-fire the same
-- automation. Due rows are claimed atomically with FOR UPDATE SKIP LOCKED and
-- stamped with a per-invocation claim token. A claim that is never finalized
-- (crashed or timed-out invocation) is recovered after a stale-lease timeout
-- by allowing the row to be claimed again.

alter table public.publishing_automations
    add column if not exists claim_token uuid,
    add column if not exists claimed_at timestamptz;

create index if not exists idx_publishing_automations_claimed
    on public.publishing_automations(claimed_at)
    where claim_token is not null;

create or replace function public.claim_due_publishing_automations(
    p_claim_token uuid,
    p_limit integer default 1,
    p_stale_after_minutes integer default 30
)
returns setof public.publishing_automations
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
        select pa.id
        from public.publishing_automations pa
        where pa.is_active = true
          and (pa.next_run_at is null or pa.next_run_at <= now())
          and (
              -- unclaimed, or a stale lease left by an invocation that never finalized
              pa.claim_token is null
              or pa.claimed_at is null
              or pa.claimed_at <= now() - make_interval(mins => greatest(coalesce(p_stale_after_minutes, 30), 1))
          )
        order by pa.next_run_at asc nulls first
        limit least(greatest(coalesce(p_limit, 1), 1), 10)
        for update skip locked
    )
    update public.publishing_automations target
    set claim_token = p_claim_token,
        claimed_at = now(),
        updated_at = now()
    from due
    where target.id = due.id
    returning target.*;
end;
$$;

revoke all on function public.claim_due_publishing_automations(uuid, integer, integer) from public;
revoke all on function public.claim_due_publishing_automations(uuid, integer, integer) from anon;
revoke all on function public.claim_due_publishing_automations(uuid, integer, integer) from authenticated;
grant execute on function public.claim_due_publishing_automations(uuid, integer, integer) to service_role;
