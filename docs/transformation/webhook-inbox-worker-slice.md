# Webhook inbox worker and comparison slice

## Outcome

SwiftFlow now has a direct PostgreSQL worker boundary for the durable webhook
inbox. It can claim events, extend leases, complete or ignore work, schedule
bounded retries, and move permanent or exhausted failures to the dead-letter
state.

This slice is still non-authoritative. A dedicated comparison-worker entry
point now exists, but no production service starts it automatically. The
existing synchronous webhook route continues to execute all live automations.
The comparison process never calls Meta.

## Runtime components

- `lib/database/postgres.ts`
  - Creates a bounded `pg` connection pool from `DATABASE_URL`.
  - Supports explicit SSL and pool timeout settings.
  - Logs idle-client failures without printing the connection string.
- `lib/webhooks/postgres-inbox-repository.ts`
  - Claims work through the atomic PostgreSQL function.
  - Guards completion, retry, dead-letter, and heartbeat writes by event ID,
    current worker ID, processing status, and an unexpired lease.
- `lib/webhooks/inbox-worker.ts`
  - Runs bounded batches or a graceful polling loop.
  - Applies capped exponential retry delays.
  - Distinguishes retryable and permanent failures.
- `lib/webhooks/comment-private-reply-comparison.ts`
  - Resolves the Meta account and active canvas automations directly from
    PostgreSQL.
  - Replays current comment scope and keyword matching.
  - Confirms the private-reply action is configured and graph-reachable.
  - Records the automation IDs that would execute while sending no Meta request.
- `lib/webhooks/comment-comparison-worker.ts`
  - Composes the pool, repository, comparison lookup, handler, and worker.
- `lib/webhooks/comment-comparison-runtime.ts`
  - Bounds worker settings and verifies the inbox schema before polling.
- `workers/comment-comparison.ts`
  - Runs continuously with graceful signal handling or once for smoke checks.
- `compose.postgres-test.yaml`
  - Starts temporary PostgreSQL 15, applies the real migration, and is removed
    after `npm run test:postgres` completes.
- `Dockerfile.webhook-comparison` and `workers/package-lock.json`
  - Build an isolated, pinned, non-root worker image.
- `compose.webhook-comparison.yaml`
  - Runs the worker as a restartable, read-only service with no published ports
    or Linux capabilities.
- `supabase/migrations/20260726203000_add_webhook_comparison_worker_role.sql`
  - Defines the NOLOGIN capability role, narrow grants, and RLS policies.
- `workers/comment-comparison-healthcheck.ts`
  - Verifies schema access and every required worker privilege.

## Required worker environment

`DATABASE_URL` is required by a directly launched worker. The compose service
accepts `WEBHOOK_COMPARISON_DATABASE_URL` on the host and maps it to
`DATABASE_URL` inside the container.

Optional settings:

- `POSTGRES_POOL_MAX` — defaults to `10`.
- `POSTGRES_IDLE_TIMEOUT_MS` — defaults to `30000`.
- `POSTGRES_CONNECTION_TIMEOUT_MS` — defaults to `10000`.
- `POSTGRES_SSL_MODE=require` — enables TLS.
- `POSTGRES_SSL_REJECT_UNAUTHORIZED=false` — permits a self-signed certificate
  only when the operator explicitly chooses it.
- `WEBHOOK_COMPARISON_WORKER_ID` — defaults to `<hostname>-<pid>`.
- `WEBHOOK_COMPARISON_BATCH_SIZE` — defaults to `10`.
- `WEBHOOK_COMPARISON_LEASE_SECONDS` — defaults to `60`.
- `WEBHOOK_COMPARISON_POLL_INTERVAL_MS` — defaults to `1000`.
- `WEBHOOK_COMPARISON_RETRY_BASE_MS` — defaults to `5000`.
- `WEBHOOK_COMPARISON_RETRY_MAX_MS` — defaults to `900000`.
- `WEBHOOK_COMPARISON_RUN_ONCE=true` — claims one batch and exits.

## Safety properties

1. Two workers cannot claim the same ready row in the same claim window.
2. A crashed worker's expired lease can be reclaimed.
3. A stale worker cannot complete or reschedule a row after ownership changes.
4. The final permitted failed attempt becomes a dead letter.
5. Comparison output explicitly records `sideEffectsExecuted: false`.
6. Unsupported events are ignored only inside this comparison worker; live
   webhook processing remains unchanged.

## Verification

Current validation status:

- All 78 standard test files and 379 tests pass.
- Scoped lint passes for the inbox contract, PostgreSQL repository, worker,
  healthcheck, container runner, deployment guards, webhook route, migrations,
  and their tests.
- Project-wide type checking remains blocked by six pre-existing test-fixture
  typing errors outside this slice.
- Project-wide lint remains blocked by existing repository debt outside this
  slice.
- Production build validation stops at the environment preflight because the
  required public application and Supabase variables are not set locally.
- The isolated PostgreSQL suite passes 6 real-database tests, executes the SQL
  privilege verifier, builds the 63 MB non-root image, runs its healthcheck and
  one-shot entry point, and starts the continuous compose service until healthy.

The test suite covers:

- query parameterization and lease-owner guards;
- retry and dead-letter transitions;
- heartbeat ownership;
- concurrent claims;
- crash recovery;
- stale-worker completion rejection;
- graceful loop shutdown;
- comment normalization;
- keyword, scope, configuration, and graph reachability checks;
- self-authored comment rejection;
- zero-side-effect comparison results.

## Remaining before staging

1. Package the worker entry point as a restartable deployment service.
2. Start shadow capture and the comparison worker in staging.
3. Compare legacy and worker match decisions for representative Meta fixtures.
4. Add provider side-effect keys before enabling any Meta reply action.
5. Integrate Graphile Worker for durable automation runs and delayed nodes.
