create table if not exists public.rate_limit_buckets (
    id uuid primary key default gen_random_uuid(),
    scope text not null,
    subject_hash text not null,
    bucket_start timestamptz not null,
    count integer not null default 0 check (count > 0),
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now()),
    unique (scope, subject_hash, bucket_start)
);

create index if not exists idx_rate_limit_buckets_scope_subject_bucket
    on public.rate_limit_buckets (scope, subject_hash, bucket_start desc);

create or replace function public.consume_rate_limit(
    p_scope text,
    p_subject_hash text,
    p_limit integer,
    p_window_seconds integer,
    p_bucket_seconds integer default 60
)
returns table (
    allowed boolean,
    total_count integer,
    remaining integer,
    retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := timezone('utc'::text, now());
    v_bucket_start timestamptz;
    v_window_start timestamptz;
    v_total integer := 0;
    v_oldest_bucket timestamptz;
begin
    if p_limit <= 0 then
        raise exception 'p_limit must be greater than 0';
    end if;

    if p_window_seconds <= 0 then
        raise exception 'p_window_seconds must be greater than 0';
    end if;

    if p_bucket_seconds <= 0 then
        raise exception 'p_bucket_seconds must be greater than 0';
    end if;

    v_bucket_start := to_timestamp(
        floor(extract(epoch from v_now) / p_bucket_seconds) * p_bucket_seconds
    );
    v_window_start := v_now - make_interval(secs => p_window_seconds);

    insert into public.rate_limit_buckets (scope, subject_hash, bucket_start, count, created_at, updated_at)
    values (p_scope, p_subject_hash, v_bucket_start, 1, v_now, v_now)
    on conflict (scope, subject_hash, bucket_start)
    do update set
        count = public.rate_limit_buckets.count + 1,
        updated_at = excluded.updated_at;

    select
        coalesce(sum(count), 0)::integer,
        min(bucket_start)
    into v_total, v_oldest_bucket
    from public.rate_limit_buckets
    where scope = p_scope
      and subject_hash = p_subject_hash
      and bucket_start >= v_window_start;

    allowed := v_total <= p_limit;
    total_count := v_total;
    remaining := greatest(p_limit - v_total, 0);

    if allowed or v_oldest_bucket is null then
        retry_after_seconds := 0;
    else
        retry_after_seconds := greatest(
            ceil(extract(epoch from ((v_oldest_bucket + make_interval(secs => p_window_seconds)) - v_now)))::integer,
            1
        );
    end if;

    return next;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, integer, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, text, integer, integer, integer) to service_role;
