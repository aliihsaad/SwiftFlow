-- Operational diagnostics only. No public/application table is changed here.
-- Keep successful minute heartbeats 1 day; keep failures and other jobs 7 days.
-- SKIP LOCKED + small batches avoid waiting on the live scheduler's log writes.
-- No TRUNCATE/VACUUM FULL: pg_net's existing 6-hour TTL remains untouched.
select cron.schedule(
  'purge-cron-run-history',
  '17 3 * * *',
  $job$
    set lock_timeout = '500ms';
    set statement_timeout = '5s';
    with expired as (
      select history.runid
      from cron.job_run_details as history
      where history.end_time is not null
        and (
          history.end_time < now() - interval '7 days'
          or (
            history.status = 'succeeded'
            and history.end_time < now() - interval '1 day'
            and history.jobid in (
              select jobid from cron.job where jobname = 'scheduler-tick-cron'
            )
          )
        )
      order by history.end_time
      limit 10000
      for update skip locked
    )
    delete from cron.job_run_details as history
    using expired where history.runid = expired.runid;
  $job$
);
