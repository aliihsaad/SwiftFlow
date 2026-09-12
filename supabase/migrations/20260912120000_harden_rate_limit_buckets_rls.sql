-- Hardens public.rate_limit_buckets, which 20260406220000_add_rate_limit_buckets.sql
-- created without row level security and without narrowing its grants. Stock
-- Supabase default privileges grant ALL on new public tables to anon and
-- authenticated, so the table backing every application rate limit has been
-- directly reachable over PostgREST by any signed-in user.
--
-- No application code queries this table directly: its only accessor is
-- public.consume_rate_limit(), a security definer function already restricted
-- to service_role (20260406220000_add_rate_limit_buckets.sql:89-90). Security
-- definer functions bypass RLS, so enabling RLS and revoking direct grants
-- removes the PostgREST surface without changing any application behaviour.
--
-- Intentionally no policies: service_role bypasses RLS, and no other role has
-- a legitimate reason to read or write these rows.

alter table public.rate_limit_buckets enable row level security;

revoke all on table public.rate_limit_buckets from public, anon, authenticated;
grant all on table public.rate_limit_buckets to service_role;
