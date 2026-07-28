# Webhook comparison: isolated staging stack

## Outcome

The comparison worker can run with its own private PostgreSQL 15 database,
persistent volume, synthetic automation fixture, and dedicated least-privilege
login. The stack publishes no ports and uses an internal container network.

This is the safe staging target for worker validation. The callback, signature
verification, durable inbox, matching path, and disabled-side-effect execution
path have been verified with real Meta tester traffic.

## Why the existing web preview is not staging

A web preview is not isolated when its backend variables point to the same
database project as production. In that configuration, enabling
`WEBHOOK_INBOX_SHADOW_ENABLED` would write experimental inbox rows into the
live database.

Do not enable the shadow flag in any preview environment until its database and
webhook ingress are demonstrably separate from production.

## Files

- `compose.webhook-comparison.staging.yaml` starts the private database and the
  hardened comparison worker.
- `scripts/postgres/staging/000-base-schema.sql` creates only the comparison
  input tables needed for this deployment gate.
- `scripts/postgres/staging/300-worker-login.sh` creates the deployment login
  and grants the NOLOGIN capability role.
- `scripts/postgres/staging/400-smoke-seed.sql` inserts a fully synthetic
  account, automation graph, and comment event.
- `scripts/postgres/staging/verify-smoke-result.sql` proves that the worker
  matched the expected automation without executing a provider side effect.
- `scripts/postgres/staging/310-ingress-login.sh` creates the append-only
  ingress login and grants its NOLOGIN capability role.
- `scripts/postgres/verify-webhook-ingress-role.sql` proves the ingress login
  can only append.
- `scripts/postgres/staging/verify-ingress-result.sql` proves a synthetic signed
  delivery was stored once and its replay created no second row.
- `scripts/deploy-webhook-comparison-staging.sh` converges the deployment: it
  adds any missing on-host secret without rotating existing ones, applies the
  idempotent schema and login scripts that `docker-entrypoint-initdb.d` skips on
  an already initialized database, starts the stack, verifies both restricted
  roles, drives a synthetic signed delivery through the ingress, and verifies
  the synthetic results. It is safe to re-run.

## Deploy on an approved Docker host

Copy the reviewed artifact to a dedicated directory on the approved host, then
run:

```sh
sh scripts/deploy-webhook-comparison-staging.sh /opt/swiftflow-staging
```

The script creates `.env.worker.staging` with mode `0600` when the file does
not already exist. The environment file is untracked and must never be copied
back into the repository.

Successful verification reports:

- both containers healthy;
- the current database user is
  `swiftflow_webhook_worker_staging`;
- the worker cannot read `social_accounts.access_token` or
  `social_accounts.refresh_token`;
- the synthetic event status is `succeeded`;
- exactly one synthetic automation matched;
- `side_effects_executed` is `false`.

## Current activation gate

The provider-neutral ingress adapter is implemented and verified. See
`provider-neutral-webhook-ingress.md`: the `webhook-ingress` service writes
verified deliveries to this database through the append-only
`swiftflow_webhook_ingress_staging` login, and PostgreSQL is still unexposed.

The application webhook route still constructs
`createSupabaseWebhookInboxStore`. It is unchanged on purpose; the isolated
stack is fed by its own ingress, not by the hosted route.

HTTPS exposure is also complete. The host's Caddy instance serves
`https://webhooks.social.swiftdigital-s.com/webhooks/meta` and proxies only that
path to the ingress at its pinned internal address. No container publishes a
host port, and PostgreSQL has no host listener.

The real-provider staging gate is complete. The steady safety posture is:

1. keep `WEBHOOK_INBOX_SHADOW_ENABLED` unset so the hosted route does not
   receive a duplicate copy;
2. route only the reviewed Meta callback path to this ingress;
3. never publish PostgreSQL port 5432;
4. use the real app secret and verification token only in the protected
   on-host environment file;
5. keep `AUTOMATION_PROVIDER_ACTIONS_ENABLED=false` and the provider allowlist
   empty until the separately approved controlled-reply gate;
6. retain the synthetic fixtures as deployment and health checks.
