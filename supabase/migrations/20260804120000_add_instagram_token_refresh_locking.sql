-- Atomic claim locking and refresh lifecycle metadata for automatic Instagram
-- long-lived token renewal.
--
-- Overlapping scheduler-tick invocations must not double-refresh the same
-- account. Eligible rows are claimed atomically with FOR UPDATE SKIP LOCKED and
-- stamped with a per-invocation claim token. A claim that is never finalized
-- (crashed or timed-out invocation) is recovered after a stale-lease timeout by
-- allowing the row to be claimed again.

alter table public.social_accounts
    add column if not exists refresh_claim_token uuid,
    add column if not exists refresh_claimed_at timestamptz;

create index if not exists idx_social_accounts_instagram_refresh_claimed
    on public.social_accounts(refresh_claimed_at)
    where refresh_claim_token is not null;

-- Claim due Instagram accounts that are inside the renewal window, not already
-- expired, not flagged for reconnection, and not leased by another worker (or
-- whose lease has gone stale). Also respects metadata.token_refresh_next_at so
-- transient-failure backoffs are honored.
create or replace function public.claim_due_instagram_token_refreshes(
    p_claim_token uuid,
    p_limit integer default 20,
    p_stale_after_minutes integer default 30,
    p_renewal_window_days integer default 14
)
returns setof public.social_accounts
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_claim_token is null then
        raise exception 'p_claim_token is required';
    end if;

    return query
    with due as (
        select sa.id
        from public.social_accounts sa
        where sa.platform = 'instagram'
          and sa.access_token is not null
          and sa.token_expires_at is not null
          and sa.token_expires_at > now()
          and sa.token_expires_at <= now() + ((p_renewal_window_days || ' days')::interval)
          and (
              sa.metadata->>'reconnect_required' is null
              or sa.metadata->>'reconnect_required' = 'false'
          )
          and (
              sa.metadata->>'token_health' is null
              or sa.metadata->>'token_health' != 'invalid'
          )
          and (
              sa.refresh_claim_token is null
              or sa.refresh_claimed_at is null
              or sa.refresh_claimed_at <= now() - make_interval(mins => greatest(coalesce(p_stale_after_minutes, 30), 1))
          )
          and (
              sa.metadata->>'token_refresh_next_at' is null
              or (sa.metadata->>'token_refresh_next_at')::timestamptz <= now()
          )
        order by sa.token_expires_at asc
        limit least(greatest(coalesce(p_limit, 1), 1), 100)
        for update skip locked
    )
    update public.social_accounts target
    set refresh_claim_token = p_claim_token,
        refresh_claimed_at = now(),
        updated_at = now()
    from due
    where target.id = due.id
    returning target.*;
end;
$$;

revoke all on function public.claim_due_instagram_token_refreshes(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_instagram_token_refreshes(uuid, integer, integer, integer)
  to service_role;
