# Reclaiming database size

One-time runbook for the Supabase warning:

> You have projects that are exceeding 0.5 GB of database size.

## Diagnosis (2026-09-12)

Total database: **492 MB**. Almost none of it was application data.

| Schema | Size | Share | What it is |
|---|---:|---:|---|
| `net` | 272 MB | 55% | pg_net HTTP response log |
| `cron` | 202 MB | 41% | pg_cron job run history |
| `pg_catalog` | 18 MB | 4% | system catalogs |
| **`public`** | **15 MB** | **3%** | **all SwiftFlow application data** |

Both large tables are byproducts of `scheduler-tick-cron`, which fires every
minute and therefore writes ~1,440 rows/day to each.

They are two different problems:

- **`cron.job_run_details` — 289,479 real rows** spanning 2026-02-23 to now.
  pg_cron has no built-in retention, so this is genuine unbounded accumulation.
- **`net._http_response` — only 360 live rows** covering the last ~6 hours
  (pg_net expires its own rows), but **271 MB of heap with 0 dead tuples**.
  That is bloat: space freed by past deletes that was never returned to the OS.
  It will not keep growing much, but it will never shrink on its own either.

### What this is NOT

The `retention-cleanup` edge function and `workspace_retention_policies` target
`oauth_page_sessions`, `workspace_invites`, `webhook_events` and similar
**public-schema** tables. Those total ~15 MB. Enabling retention cleanup is
worth doing on its own merits, but it would reclaim about 3% here and would not
resolve the warning.

## Prevention (already in the repo)

`supabase/migrations/20260912170000_prune_cron_run_history.sql` schedules
`purge-cron-run-history`, which trims `cron.job_run_details` to 7 days nightly
at 03:17 UTC. Apply it with `npx supabase db push --linked`.

That stops future growth. It does not reclaim what is already on disk, because
`DELETE` marks space reusable rather than returning it — and `VACUUM FULL` is
not available here: both tables are owned by `supabase_admin`, not `postgres`.

## One-time reclaim

`postgres` holds TRUNCATE on both tables, and TRUNCATE returns the space
immediately without needing table ownership. Run in the Supabase dashboard SQL
editor.

### 1. pg_net response log — reclaims ~271 MB

```sql
truncate net._http_response;
```

Safe because: the table is `UNLOGGED`, pg_net already expires rows on a ~6 hour
TTL, and nothing in this codebase reads it. The `scheduler-tick-cron` command
calls `net.http_post(...)` without reading the response back, so discarding
responses cannot affect scheduling. Worst case is losing the response record of
a request in flight at that instant, which nothing consumes.

### 2. pg_cron run history — reclaims ~195 MB

Simplest, and what is recommended:

```sql
truncate cron.job_run_details;
```

Safe because: pg_cron never reads this table to decide anything — it is a log.
No application code queries it. Scheduling, job definitions and the
`scheduler-tick` heartbeat are stored in `cron.job`, which this does not touch.

If you would rather keep recent history, this variant preserves the last two
days. It is slightly more involved and briefly races the every-minute tick
(harmless — at worst one run's row is re-inserted or missed):

```sql
create temp table cron_history_keep as
  select * from cron.job_run_details
  where end_time > now() - interval '2 days';

truncate cron.job_run_details;

insert into cron.job_run_details select * from cron_history_keep;
drop table cron_history_keep;
```

### 3. Verify

```sql
select pg_size_pretty(pg_database_size(current_database())) as total_db_size;

select n.nspname as schema, pg_size_pretty(sum(pg_total_relation_size(c.oid))) as size
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','m','i')
group by n.nspname
order by sum(pg_total_relation_size(c.oid)) desc
limit 6;
```

Expect the total to drop from ~492 MB to well under 50 MB.

## If it grows back

The nightly purge bounds `cron.job_run_details`. If `net._http_response`
bloats again over months, re-run the truncate in step 1 — it is safe to repeat.

The root driver is the every-minute tick. Reducing that frequency would cut
both logs proportionally, but it directly increases automation latency for
delay-node resumes, so it is not recommended as a size fix.
