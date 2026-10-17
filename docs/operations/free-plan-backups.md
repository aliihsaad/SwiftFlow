# Free-plan database backups and diagnostic retention

This setup leaves Supabase on Free. It does not change automation execution,
retry scheduling, follower checks, or delivery deduplication.

## Scheduled backups

The deployment target is a **private** GitHub repository (`swiftflow-backups`).
Copy `scripts/managed-backup/{backup,crypto,verify}.mjs` and `supabase-ca.crt`
to its root; install `workflow.yml` as `.github/workflows/backup.yml`.
The workflow runs daily at 02:41 UTC and can be dispatched manually.
There are no push/PR triggers and no repository write permission.
The Linux runner uses the pinned Supabase CLI's official dry-run export scripts
with PostgreSQL 17 from PostgreSQL's signed repository. The generated scripts use
dummy credentials; actual connection details are supplied only through the child
environment, with CA-verified TLS, read-only transactions and bounded timeouts.
Both `supabase` and its companion `supabase-go` binary must be installed together.

Configure these repository secrets:

- `SUPABASE_DB_URL`: direct or **session** pooler URI on port 5432. Percent-encode the password.
- `SUPABASE_SERVICE_KEY`: read Storage files through the existing service API.
- `APP_SECRETS_ENCRYPTION_KEY`: required to recover encrypted application credentials.

Configure repository variables `SUPABASE_URL` and `BACKUP_PUBLIC_KEY`.
Never upload the private recovery key. Keep a second copy in your password
manager or another safe location outside this PC; losing it makes all encrypted
backups unusable. Rotating it requires keeping old keys for old archives.

Each archive contains official Supabase CLI roles, application schema, a single
consistent application/Auth/Storage data dump, migration history, a supplementary
managed-schema reference, Storage file bytes and object mapping, the application
encryption key, and a SHA-256 inventory. The temporary plaintext directory is
removed in a finally block; only authenticated ciphertext and its checksum are
uploaded. The private key is never supplied to GitHub. The archive uses random
AES-256-GCM keys wrapped with RSA-OAEP-SHA256.

Operational cron configuration/history and pg_net request/response tables are
excluded from the data restore. Platform secrets/settings, OAuth provider config,
Edge Function deployment and external Meta state are not reconstructed by a DB
dump. Use the versioned SwiftFlow deployment setup to reconnect those services.
Custom auth/storage objects are preserved in the supplementary reference file;
review their differences before restoring to hosted Supabase.

Database backups are SELECT-only and use PostgreSQL MVCC. They do not pause
automations or take locks that block ordinary inserts/updates. Avoid simultaneous
schema migrations. Storage API downloads are not transactionally synchronized
with PostgreSQL: a concurrent file deletion makes the backup fail rather than
silently omit the file. Replaced files may represent a slightly later version.

The job keeps seven days of encrypted artifacts, limits each compressed archive
to 20 MiB, rejects another successful backup on the same UTC date, and checks a
140 MiB existing-artifact budget before proceeding. Seven copies plus one in
flight stay under 161 MiB. GitHub Free's 500 MB storage and 2,000 monthly minutes
are shared with other repositories; do not enable paid overages for this job.
The 15-minute runner timeout bounds this job to at most 465 scheduled minutes
in a 31-day month. No cache is used. Size guards fail visibly; they never drop
application rows to fit. Failed runs use normal GitHub Actions notifications.
Daily backups have an approximately 24-hour RPO, longer if a run fails or GitHub
delays scheduling. They are not point-in-time recovery.

## Verify and rehearse a restore

Download a successful artifact, verify its `.sha256` file, then decrypt locally:

```sh
node scripts/managed-backup/crypto.mjs decrypt swiftflow-YYYY-MM-DD.sfb backup.tar.gz /safe/location/recovery-private.pem
mkdir restored-backup
tar -xzf backup.tar.gz -C restored-backup
node scripts/managed-backup/verify.mjs restored-backup
```

Use an **isolated** compatible PostgreSQL/Supabase test instance with no incoming
webhooks, no Edge Functions and cron execution disabled. The default Supabase
restore steps are roles, application schema and data, using `psql -X` and
`ON_ERROR_STOP=1`. Empty PostgreSQL rehearsal instances also need the matching
managed schemas; the supplementary reference provides those definitions. It is
not intended to replace a new hosted project's platform-managed schemas.
Restore migration history separately. Verify Auth users, workflow versions,
queue checkpoints, delivered-recipient markers, foreign keys and file checksums.
For an empty local Supabase Postgres image, load `pg_cron,pg_net` while keeping
`cron.launch_active_jobs=off`. Restore the managed reference's base definitions
before the application schema; defer its triggers, policies and foreign keys
until after the application schema to resolve cross-schema dependencies. Use
only the isolated test database's admin role for that rehearsal. Hosted recovery
should preserve the platform-managed baseline instead of replacing those schemas.
Restore Storage objects with their recorded bucket/path/content type through
the Storage API rather than inserting new metadata rows by hand.

**Never reconnect a restored backup to live Meta immediately.** Restoring older
deduplication/checkpoint records cannot undo messages sent after the snapshot.
Keep all restored automations paused; compare deliveries after `startedAt` with
Meta/current evidence before enabling the scheduler or webhooks. Any uncertain
in-flight provider action requires manual reconciliation. Otherwise a correct
database restore can still duplicate real-world replies.

## Diagnostic cleanup

Migration `20261017120000_bound_scheduler_diagnostic_history.sql` updates only
the existing `purge-cron-run-history` job. At 03:17 UTC it removes up to 10,000
completed diagnostic records: successful `scheduler-tick-cron` heartbeats older
than one day, and other completed history older than seven days. Rows in flight
are excluded. It uses SKIP LOCKED, a 500 ms lock timeout and a five-second query
timeout; application tables, cron job definitions, and the minute cadence stay
intact. A large backlog drains over several nights.

`net._http_response` already expires after six hours. Do not schedule recurring
TRUNCATE or VACUUM FULL: they require stronger locks and erase recent diagnostics.
Its existing allocated space can be reused. If one-time physical reclamation
becomes necessary, use the separate database-size-reclaim runbook during a quiet
period. PostgreSQL DELETE does not immediately return allocated disk space.

The scheduler samples only its established successful idle response, retaining
an hourly heartbeat, every actual-work response, maintenance results and all
errors. It still invokes every worker and returns identical response payloads.
The broad `RETENTION_CLEANUP_MODE` remains unchanged; it can delete application
history and is not enabled by this work.

Rollback: restore the prior seven-day cron command with the same named job;
redeploy the preceding scheduler-tick version to restore minute success logging.
Disable only the GitHub backup workflow to stop snapshots. Do not disable the
automation scheduler. A rollback cannot recreate already-expired diagnostic logs.

## Initial validation (2026-10-17)

The first encrypted snapshot was decrypted and restored into a disposable
Supabase PostgreSQL 17 instance: all 88 tables and 14,670 rows matched the snapshot,
nine relevant unique deduplication indexes were present, and the stored file's
checksum matched. No cron jobs or outbound HTTP queue entries were restored.
The retention migration was separately exercised with old/recent/failed/in-flight
fixtures and applied twice to verify idempotency before production application.
Production cleanup removed 9,881 diagnostic rows; the existing minute scheduler
definition was verified unchanged. Scheduler version 12 retains JWT verification.

References: [Supabase backups](https://supabase.com/docs/guides/deployment/ci/backups),
[restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[GitHub Actions allowances](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
