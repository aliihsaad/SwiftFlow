# Provider-neutral webhook ingress

## Outcome

SwiftFlow now has a standalone ingress service that verifies signed Meta
deliveries and appends them to the durable inbox through a PostgreSQL role that
can do nothing but insert.

This closes the activation gate recorded in
`webhook-comparison-isolated-staging.md`: the isolated staging database can
finally receive real events without exposing PostgreSQL and without granting
the ingress any ability to read, mutate, or claim stored work.

Live traffic is still not connected. The stack publishes no host port, no
reverse proxy is configured, and `WEBHOOK_INBOX_SHADOW_ENABLED` stays unset.

## Why a separate service instead of the existing route

The application route at `app/api/webhooks/instagram/route.ts` runs on the
hosted platform and talks to Supabase. The isolated staging database is private
to its Docker host and publishes no port, so the route cannot reach it, and
opening one would undo the isolation the staging stack was built to prove.

The ingress therefore runs beside the database as its own process. It shares the
worker image and the same provider-neutral event contract
(`lib/webhooks/inbox-contract.ts`), so normalization, event keys, and duplicate
protection are identical on both paths. The eventual public exposure is a
separate, reviewed reverse-proxy step in front of this one service.

## Least-privilege boundary

Three roles now touch the inbox, each with a distinct capability:

| Role | Inbox capability | Account/automation data | Claim function |
| --- | --- | --- | --- |
| `swiftflow_webhook_ingress` | insert on 7 columns | none | no |
| `swiftflow_webhook_comparison` | select, update on lifecycle columns | narrow column reads, no tokens | yes |
| deployment admin | full | full | yes |

The ingress role is granted insert on `provider`, `provider_event_key`,
`provider_object`, `event_type`, `account_external_id`, `delivery_hash`, and
`payload` only. Every lifecycle column keeps its table default, so a compromised
ingress cannot pre-set a status, a lease, an attempt count, or a resolved
workspace. An RLS insert policy repeats the same rule independently, so widening
the grants by mistake still cannot produce a pre-claimed row.

`assertWebhookIngressDatabaseAccess` runs at startup and in the container
healthcheck. It refuses to serve traffic when the connection can read the inbox,
update it, delete from it, execute the claim function, reach `social_accounts`,
`automations`, or `workspaces`, create objects in `public`, or hold any
superuser-class attribute.

## Why the insert has no conflict target

Duplicate protection uses `on conflict do nothing` with no arbiter named. This
is not a style choice. PostgreSQL requires `select` privilege on the table
whenever an `on conflict` target is specified, whether inferred from columns or
named as a constraint:

```text
insert ... on conflict (provider, provider_event_key) do nothing
ERROR:  permission denied for table webhook_inbox_events
```

Granting `select` to satisfy that would let the ingress read every stored
payload, which is exactly what this role exists to prevent. The untargeted form
runs under insert-only rights and is unambiguous because
`webhook_inbox_events` has one unique constraint besides its defaulted primary
key. An integration test asserts that constraint inventory, so adding another
unique index fails the build instead of silently widening what gets skipped.
Check-constraint violations, such as a malformed `delivery_hash`, are still
raised rather than swallowed.

For the same reason the statement has no `returning` clause. The number of rows
actually appended comes from the insert command tag, so duplicates are counted
without ever reading the inbox back.

## Request handling

| Case | Response |
| --- | --- |
| `GET` with `hub.mode=subscribe` and the configured token | `200` with the challenge echoed |
| `GET` with a wrong token or mode | `403`, challenge never echoed |
| `POST` without `X-Hub-Signature-256` | `401` |
| `POST` with a signature from another secret | `401` |
| `POST` above the byte cap | `413`, rejected while streaming |
| `POST` with a signed non-JSON or non-object body | `400` |
| `POST` that is verified and stored | `200` with total/inserted/duplicates |
| `POST` that cannot be stored | `503`, so Meta re-delivers |

The signature is verified before the body is parsed, and the raw bytes are
capped before verification, so an unauthenticated caller cannot force parsing or
exhaust memory. A failed inbox write never returns `2xx`: the delivery stays
eligible for Meta's retry instead of being acknowledged and lost. Database
errors are logged, never returned to the caller.

## Files

- `supabase/migrations/20260726213000_add_webhook_ingress_role.sql` - the
  NOLOGIN capability role, column-level grants, and RLS insert policy.
- `lib/webhooks/postgres-inbox-store.ts` - append-only `WebhookInboxStore` with
  chunked multi-row inserts.
- `lib/webhooks/ingress-runtime.ts` - configuration, signature and token
  verification, bounded body reads, request routing, and the startup
  least-privilege assertions.
- `workers/webhook-ingress.ts` - the HTTP service.
- `workers/webhook-ingress-healthcheck.ts` - database and liveness probe used by
  the container healthcheck.
- `workers/webhook-ingress-smoke.ts` - synthetic signed-delivery deployment
  proof.
- `scripts/postgres/staging/310-ingress-login.sh` - staging login creation.
- `scripts/postgres/verify-webhook-ingress-role.sql` - append-only verifier.
- `scripts/postgres/staging/verify-ingress-result.sql` - proves a stored
  synthetic delivery and that a replay created no second row.

## Upgrading an existing deployment

`scripts/deploy-webhook-comparison-staging.sh` converges an existing
installation rather than assuming a clean host. Two things break a naive
re-deploy, and both are handled:

1. **The environment file already exists.** Generating secrets only when the
   file is absent would leave a pre-ingress deployment without
   `WEBHOOK_INGRESS_DB_PASSWORD`, `META_APP_SECRET`, and
   `META_WEBHOOK_VERIFY_TOKEN`, and Compose would abort on its `:?` guards. The
   script now appends only the variables that are missing. Existing values are
   never read, reprinted, or rotated, only variable names are echoed, and a file
   without a trailing newline is repaired before anything is appended.

2. **`docker-entrypoint-initdb.d` never runs again.** PostgreSQL executes those
   scripts only when the data directory is empty, so a database initialized
   before the ingress role existed would never gain it, and the ingress would
   fail its own startup assertion. The script therefore starts PostgreSQL
   first and alone, applies the inbox schema, both capability roles, and both
   deployment logins explicitly, and only then starts the remaining services.
   Every applied file is idempotent; the non-idempotent base schema and smoke
   seed are deliberately excluded.

The ordering matters: the ingress healthcheck asserts its own least-privilege
role, so it cannot pass until that schema exists.

## Verification

Run locally on 2026-07-26:

- `npm run test:ci` - 430 tests across 82 files pass, including 34 new unit
  tests for the store and ingress runtime and 13 new security tests for the role,
  verifier, and staging wiring.
- `npm run test:postgres` - 21 integration tests pass against a real PostgreSQL
  15 instance. They prove the ingress role can append but cannot select, update,
  delete, claim, read accounts or automations, or create objects; that a replayed
  delivery is deduplicated; and that a signed HTTP delivery lands in the database
  while an unsigned or forged one stores nothing.
- Both least-privilege verifiers pass in the same run, reporting
  `verified_worker_login` and `verified_ingress_login`.
- `npm run lint` - unchanged from the recorded baseline of 214 errors and 49
  warnings; the new files contribute none.

Upgrade rehearsal, run locally against a disposable copy of the deployment
subset on 2026-07-26:

- Starting from an environment file holding only the four pre-ingress variables
  and no trailing newline, the deploy script appended exactly the three missing
  variables, left the four existing values byte-identical, and brought all three
  services to healthy.
- The database was then rolled back to a pre-ingress state by dropping the
  insert policy, both ingress roles, and their grants. Re-running the deploy
  script recreated them, the ingress passed its own startup least-privilege
  assertion and reached healthy, and both role verifiers passed again.
- The synthetic signed delivery deduplicated across the rollback
  (`firstInserted=0`, `firstDuplicates=1`), and the comparison worker consumed
  the ingested row to a terminal `ignored` state with no provider side effect,
  proving the ingress-to-worker chain end to end.
- File mode could not be asserted in the rehearsal because `chmod` is a no-op on
  the Windows filesystem used for it. The script's unconditional `chmod 600`
  applies on the Linux host, where mode 0600 was previously verified.

## HTTPS exposure

The ingress is reachable at `https://webhooks.social.swiftdigital-s.com/webhooks/meta`,
terminated by the host's Caddy instance. No container publishes a host port.

Docker will not publish a port for a container attached only to an `internal`
network. It accepts the request - `HostConfig.PortBindings` is populated - but
`NetworkSettings.Ports` comes back empty and no listener is created, with no
error or warning. A `127.0.0.1` binding therefore silently does nothing here.

The working arrangement pins the network's IPAM subnet and gives the ingress a
static address, which the host-side proxy reaches over the bridge:

```yaml
  webhook-ingress:
    networks:
      comparison:
        ipv4_address: 172.22.0.10

networks:
  comparison:
    internal: true
    ipam:
      config:
        - subnet: 172.22.0.0/16
```

This keeps the stack completely unpublished: nothing listens on a host
interface, the network stays sealed, and the ingress has no outbound internet
access. Pinning the subnet is what makes the static address legal; Docker only
permits `ipv4_address` on a network with user-configured IPAM.

The Caddy route lives in `/etc/caddy/conf.d/swiftflow-webhooks.caddy`, pulled in
by a single `import /etc/caddy/conf.d/*.caddy` line appended to the shared
Caddyfile. Only the exact webhook path is proxied; every other path returns 404,
so `/healthz` is not publicly reachable.

Verified from outside the host on 2026-07-26: unsigned POST 401, bogus-signature
POST 401, `/healthz` 404, `/` 404, `/admin` 404, traversal attempt 404, valid
verify-token GET 200 echoing the challenge, wrong-token GET 403, and a Let's
Encrypt certificate for the hostname. Ports 8080, 8081, and 5432 are unreachable
externally and have no host listener.

## Still gated

1. No host port is published and the Compose network stays `internal: true`.
2. `META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN` are generated as staging
   placeholders by the deployment script. Real Meta values belong in the stack
   only when a callback is deliberately connected.
3. No Meta callback is configured; the public URL exists but no provider sends
   to it.
4. `WEBHOOK_INBOX_SHADOW_ENABLED` stays unset in every environment.
5. The comparison worker remains side-effect-free; no provider action is sent.

## Next steps

1. Connect a Meta developer/tester account and verify OAuth, subscriptions,
   token health, and real webhook delivery to the public URL.
2. Compare real comment traffic against the expected automation in dry-run mode.
3. Add provider side-effect idempotency, retry/backoff, token lifecycle
   handling, self-loop protection, and a kill switch before any reply is sent.
