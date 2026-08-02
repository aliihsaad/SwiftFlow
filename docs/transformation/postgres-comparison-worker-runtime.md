# PostgreSQL comparison worker runtime

## Status

The durable webhook comparison worker now has a runnable Node.js process and a
clean-room PostgreSQL integration harness. It is still shadow-only:

- the current synchronous webhook path remains authoritative;
- the worker never calls Meta;
- every comparison result records `sideEffectsExecuted: false`;
- no production worker service is enabled automatically.

## Start the process

Apply `supabase/migrations/20260726190000_add_durable_webhook_inbox.sql`, set
`DATABASE_URL`, and run:

```bash
npm run worker:webhook-comparison
```

The process checks that the inbox table and claim function exist before it
starts polling. `SIGINT` and `SIGTERM` stop polling and drain the PostgreSQL
pool.

For a readiness smoke check that claims at most one batch and exits:

```bash
WEBHOOK_COMPARISON_RUN_ONCE=true npm run worker:webhook-comparison
```

On PowerShell:

```powershell
$env:WEBHOOK_COMPARISON_RUN_ONCE = "true"
npm run worker:webhook-comparison
```

## Worker settings

| Variable | Default | Boundary |
| --- | ---: | --- |
| `WEBHOOK_COMPARISON_WORKER_ID` | `<hostname>-<pid>` | Trimmed to 120 characters |
| `WEBHOOK_COMPARISON_BATCH_SIZE` | `10` | 1-100 |
| `WEBHOOK_COMPARISON_LEASE_SECONDS` | `60` | 5-3600 |
| `WEBHOOK_COMPARISON_POLL_INTERVAL_MS` | `1000` | 50-60000 |
| `WEBHOOK_COMPARISON_RETRY_BASE_MS` | `5000` | 100-3600000 |
| `WEBHOOK_COMPARISON_RETRY_MAX_MS` | `900000` | Base delay to 86400000 |
| `WEBHOOK_COMPARISON_RUN_ONCE` | `false` | `true` or `1` enables one-shot mode |

PostgreSQL pool and TLS settings remain documented in `env.example`.

## Isolated database verification

Run:

```bash
npm run test:postgres
```

The command:

1. starts PostgreSQL 15 from `compose.postgres-test.yaml`;
2. stores its data on a temporary in-memory filesystem;
3. creates only the minimum workspace/account/automation schema;
4. applies the real durable-inbox and worker-role migrations;
5. tests deduplication, concurrent claims, expired-lease recovery, stale-owner
   rejection, retry/dead-letter transitions, and a real comparison result;
6. proves the worker login has no elevated attributes and cannot read
   workspaces, insert inbox rows, or rewrite webhook payloads;
7. builds the isolated worker image with its pinned runtime lockfile;
8. runs the image healthcheck and one-shot worker under the restricted login;
9. starts the continuous compose service and waits for healthy status;
10. removes every test container, network, and temporary database volume.

The integration suite accepts only a loopback database URL whose database name
contains `test`, preventing accidental truncation of a shared or production
database.

## Deployment boundary

The worker image and restartable compose service are now defined. The container
runs as a non-root user with a read-only filesystem, no published ports, no
Linux capabilities, and a database-backed healthcheck.

`swiftflow_webhook_comparison` is a NOLOGIN capability role. A separate staging
or production LOGIN role inherits it and receives only inbox read/state-update
permissions plus read-only social-account and automation access. Migration-owner
or broad application credentials must never be supplied to the worker.

See `docs/transformation/webhook-comparison-staging-deployment.md` for the
credential, verification, startup, shadow-enable, and rollback procedure.

## Next staging gate

1. Apply both inbox migrations to staging.
2. Create and verify the dedicated staging login.
3. Start `compose.webhook-comparison.yaml` and wait for healthy status.
4. Enable `WEBHOOK_INBOX_SHADOW_ENABLED=true` only in staging.
5. Compare legacy and worker match decisions for tester-account traffic.
6. Keep all Meta actions disabled until provider side-effect keys exist.
