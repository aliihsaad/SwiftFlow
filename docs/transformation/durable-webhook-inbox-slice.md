# Durable webhook inbox: first compatibility slice

## Outcome

SwiftFlow now has an additive PostgreSQL inbox contract for signed Meta webhook
events. The existing synchronous webhook path remains authoritative. An optional
shadow mode can copy verified events into the inbox so duplicate behavior and
operational load can be observed before any traffic cutover.

## What this slice guarantees

- Signature verification and the request-body limit still run before parsing or
  persistence.
- A Meta batch is split into individual logical events.
- Comment IDs, message MIDs, postback MIDs, and other stable provider IDs are
  preferred for event identity.
- Canonical SHA-256 identities cover events without a stable provider ID.
- The database enforces one row per `(provider, provider_event_key)`.
- Worker claims are atomic and use expiring leases with bounded attempts.
- Webhook signatures and app secrets are not stored.
- Shadow capture fails open to the current synchronous route, so enabling the
  experiment cannot suppress existing automation processing.

## Rollout mode

`WEBHOOK_INBOX_SHADOW_ENABLED` defaults to `false`.

After applying
`supabase/migrations/20260726190000_add_durable_webhook_inbox.sql`, a test or
staging environment can set the flag to `true`. Shadow mode writes inbox rows
and then continues through the current synchronous handlers.

Do not use the inbox as the authoritative path yet. The cutover requires:

1. A deployed Node.js worker process. The executable entry point is implemented
   and smoke-tested; a restartable deployment service remains pending.
2. Explicit success, ignore, retry, and dead-letter transitions. Implemented.
3. A provider side-effect key for Meta replies.
4. Crash-recovery and duplicate-worker-execution tests. Implemented and passing
   against temporary PostgreSQL 15 using the real migration.
5. Live tester-account evidence showing no lost acknowledged events.

## Next slice

Package the worker as a restartable service, then run shadow comparison in
staging before introducing provider side-effect keys.
