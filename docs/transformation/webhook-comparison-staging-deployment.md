# Webhook comparison worker: staging deployment

## Scope

This runbook deploys the durable webhook comparison worker as a restartable,
side-effect-free service. It does not move webhook authority away from the
current synchronous path and it does not call Meta.

The deployment artifacts are:

- `Dockerfile.webhook-comparison` — isolated Node.js worker image;
- `compose.webhook-comparison.yaml` — hardened restartable service;
- `supabase/migrations/20260726203000_add_webhook_comparison_worker_role.sql`
  — NOLOGIN capability role, narrow grants, and RLS policies;
- `scripts/postgres/verify-webhook-comparison-role.sql` — required and
  forbidden privilege checks.

## 1. Apply migrations with an owner credential

Apply these migrations in order using the staging migration owner:

1. `20260726190000_add_durable_webhook_inbox.sql`
2. `20260726203000_add_webhook_comparison_worker_role.sql`

Never give the migration-owner connection string to the worker container.

## 2. Create the staging login

The migration creates the reusable `swiftflow_webhook_comparison` NOLOGIN
capability role. Create a separate login for the staging deployment:

```sql
create role swiftflow_webhook_worker_staging
  login
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls;

grant swiftflow_webhook_comparison
  to swiftflow_webhook_worker_staging;
```

Set its password through an interactive database console, secret manager, or
deployment automation. Do not add the password to a migration, shell history,
repository file, or image layer.

For interactive `psql`, use:

```text
\password swiftflow_webhook_worker_staging
```

## 3. Verify the login

Connect as the new staging login and run:

```bash
psql "$WEBHOOK_COMPARISON_DATABASE_URL" \
  --file scripts/postgres/verify-webhook-comparison-role.sql
```

The verification fails when the login:

- has superuser, database creation, role creation, replication, or RLS bypass;
- cannot claim/update inbox work or read comparison inputs;
- can insert/delete inbox rows, rewrite payloads, or read workspaces.

## 4. Configure the service

Create an untracked `.env.worker.staging` on the deployment host:

```dotenv
WEBHOOK_COMPARISON_DATABASE_URL=postgresql://swiftflow_webhook_worker_staging:REPLACE_WITH_SECRET@database-host:5432/swiftflow
SWIFTFLOW_WEBHOOK_COMPARISON_IMAGE=swiftflow/webhook-comparison:staging
POSTGRES_SSL_MODE=require
POSTGRES_SSL_REJECT_UNAUTHORIZED=true
POSTGRES_POOL_MAX=10
POSTGRES_CONNECTION_TIMEOUT_MS=5000
WEBHOOK_COMPARISON_BATCH_SIZE=10
WEBHOOK_COMPARISON_LEASE_SECONDS=60
WEBHOOK_COMPARISON_POLL_INTERVAL_MS=1000
```

Restrict the file to the deployment account. The compose definition maps
`WEBHOOK_COMPARISON_DATABASE_URL` into the container as `DATABASE_URL`; this
keeps the restricted credential distinct from migration and application
credentials.

## 5. Validate and start

```bash
docker compose \
  --env-file .env.worker.staging \
  --file compose.webhook-comparison.yaml \
  config --quiet

docker compose \
  --env-file .env.worker.staging \
  --file compose.webhook-comparison.yaml \
  build

docker compose \
  --env-file .env.worker.staging \
  --file compose.webhook-comparison.yaml \
  up --detach --wait
```

The service:

- runs as a non-root user;
- has a read-only filesystem, no Linux capabilities, and no published ports;
- restarts unless explicitly stopped;
- reports unhealthy when the database schema or required privileges disappear;
- forces continuous comparison mode and keeps provider side effects disabled.

Inspect the initial state:

```bash
docker compose \
  --env-file .env.worker.staging \
  --file compose.webhook-comparison.yaml \
  ps

docker compose \
  --env-file .env.worker.staging \
  --file compose.webhook-comparison.yaml \
  logs --tail 100 webhook-comparison
```

## 6. Enable staging shadow capture

Only after the worker is healthy, set this on the staging web application:

```dotenv
WEBHOOK_INBOX_SHADOW_ENABLED=true
```

Redeploy the staging web application, send tester-account webhook traffic, and
compare the legacy decision with the worker result stored in
`webhook_inbox_events.result`.

Do not enable provider actions. A valid comparison result must continue to
contain:

```json
{
  "mode": "comparison",
  "sideEffectsExecuted": false
}
```

## Rollback

Disable `WEBHOOK_INBOX_SHADOW_ENABLED` in the staging web application and stop
the worker:

```bash
docker compose \
  --env-file .env.worker.staging \
  --file compose.webhook-comparison.yaml \
  stop webhook-comparison
```

The existing synchronous webhook path remains authoritative throughout this
stage, so rollback does not require a Meta callback change.
