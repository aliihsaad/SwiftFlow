-- Bounds the growth of pg_cron's run history.
--
-- WHY
-- The scheduler-tick-cron job runs every minute, and pg_cron records every
-- execution in cron.job_run_details forever — it has no built-in retention.
-- By 2026-09-12 that table held 289,479 rows (195 MB) going back to
-- 2026-02-23, which together with pg_net's response log accounted for 96% of
-- a 492 MB database whose application data (the whole public schema) was only
-- 15 MB.
--
-- This migration only stops the growth. Reclaiming the space already consumed
-- is a one-time operation documented in
-- docs/operations/database-size-reclaim.md, because TRUNCATE is destructive
-- and does not belong in a schema migration.
--
-- SAFETY
-- cron.job_run_details is pure operational log: pg_cron does not read it back
-- to decide anything, and nothing in this codebase queries it. Deleting old
-- rows cannot affect job scheduling or automation behaviour. Seven days is
-- kept so a failed overnight run is still diagnosable.

do $$
begin
  -- Idempotent: unschedule first so re-running this migration (or a
  -- db reset) does not create a duplicate job.
  perform cron.unschedule('purge-cron-run-history');
exception
  when others then
    -- unschedule raises if the job does not exist; that is the normal path on
    -- a first run.
    null;
end;
$$;

select cron.schedule(
  'purge-cron-run-history',
  '17 3 * * *',
  $job$
    delete from cron.job_run_details
    where end_time < now() - interval '7 days'
  $job$
);

comment on extension pg_cron is
  'Scheduled jobs. purge-cron-run-history trims cron.job_run_details to 7 days nightly; without it the table grows unbounded at ~1440 rows/day from scheduler-tick-cron.';
