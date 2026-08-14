# SwiftFlow Stable-v1 Operations Runbook

This runbook applies only to the supported Vercel + managed Supabase deployment.
It contains no VPS or Docker procedure.

## Normal release procedure

From a clean checkout of the candidate commit:

```powershell
npm ci
npm run test:ci
npm run lint
npm run build
npm run setup:supabase
vercel deploy --prod
npm run setup:check
```

`setup:check` is read only. Run it again after every secret, migration, Edge
Function, scheduler, Meta callback, or Vercel environment change. Do not record
secret values in release evidence.

## What to monitor

Check these signals during deployment and the seven-day soak:

1. SwiftFlow setup readiness and Instagram connection health;
2. automation execution history, retry state, and dead-letter state;
3. Supabase Edge Function and Cron execution logs;
4. Vercel deployment and runtime logs for OAuth, webhook, API, and auth errors;
5. Telegram health notifications when configured;
6. queue/backlog age, duplicate-action reports, and token-refresh status.

A supported journey that repeatedly fails, a growing backlog, a duplicate
provider action, credential exposure, tenant crossover, or data loss is a
release blocker.

## Incident sequence

1. Pause the affected automation in SwiftFlow so new provider actions stop.
2. Preserve the run ID, timestamps, provider event ID, deployment ID, and
   sanitized error. Never copy tokens, secrets, raw authorization headers, or
   unredacted payloads into an issue.
3. Check Vercel logs for the public route and Supabase logs for the bounded job.
4. Determine whether the event is pending, retrying, succeeded, ignored, or
   dead-lettered before attempting a replay.
5. Replay only when the prior provider outcome is known. Ambiguous provider
   outcomes require manual reconciliation first.
6. Add a regression test for a code defect before deploying the fix.
7. Re-run the repository gates and `setup:check`, then resume the automation.

## Instagram token recovery

SwiftFlow refreshes eligible long-lived Instagram tokens automatically. When a
refresh cannot recover, the connection enters a reconnect-required state.

1. Confirm the token-refresh function and scheduler ran.
2. Check the stored refresh status without exposing the token.
3. If the state is reconnect-required, use **Reconnect Instagram** in SwiftFlow.
4. Confirm readiness returns to 4/4 and run one real comment or DM test.

Do not manually paste access tokens into the database.

## Secret rotation

Rotate one credential family at a time:

1. update the secret in every runtime that consumes it (Vercel, Supabase
   Functions, or encrypted workspace settings as documented in the README);
2. redeploy only the affected runtime;
3. run `npm run setup:check` and the relevant live smoke test;
4. revoke the previous credential after the new one is proven;
5. record only the secret name, rotation time, operator, and verification result.

For the application encryption key, use the repository's current/previous key
and version mechanism. Do not remove the previous key until all stored values
have been read and rewritten successfully with the current key.

## Backup and restore rehearsal

Before a release or migration batch:

1. create schema, data, and role exports with the Supabase CLI;
2. store them outside the repository in an access-controlled backup location;
3. calculate and record SHA-256 checksums;
4. create a disposable Supabase project;
5. apply the repository migrations to reconstruct the schema;
6. import the data export using the current Supabase-supported database import
   path;
7. verify workspace counts, memberships, social accounts, automations, and run
   history without invoking real provider actions;
8. delete the disposable project after evidence is captured.

The restore rehearsal must never target production and must keep provider
actions disabled.

## Rollback

- Application rollback: restore the previous known-good Vercel deployment.
- Database rollback: migrations are forward-only and additive. Correct a faulty
  migration with a new migration; do not edit applied history or manually
  reverse production schema changes.
- Function rollback: redeploy the previous known-good function source, then run
  the relevant smoke test.
- Provider rollback: pause affected automations. Reconnect Instagram only when
  the stored connection state requires it.

After any rollback, run `npm run setup:check` and the smallest real Instagram
acceptance test that proves the affected path.
