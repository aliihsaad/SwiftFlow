# SwiftFlow Instagram Automatic Token Renewal

Date: 2026-08-04
Project: SwiftFlow
Branch: codex/instagram-only

## What changed

Implemented production-grade automatic renewal for Instagram long-lived access tokens.

- New Edge Function: `supabase/functions/instagram-token-refresh/index.ts`
- Shared policy module: `supabase/functions/_shared/instagram-token-refresh-policy.ts`
- Shared state module: `supabase/functions/_shared/instagram-token-refresh-state.ts`
- Migration: `supabase/migrations/20260804120000_add_instagram_token_refresh_locking.sql`
- Scheduler integration: `supabase/functions/scheduler-tick/index.ts` (hourly, minute 5 offset)
- Manual refresh route updated: `app/api/auth/instagram/refresh/route.ts`
- OAuth callback lifecycle metadata: `app/api/auth/instagram/callback/route.ts`
- Client metadata sanitizer: `lib/meta-account.ts`
- Renewal notice state machine: `lib/instagram-token-renewal-notice.ts` (pure,
  so the mutually exclusive UI states are unit-testable without React)
- UI lifecycle messaging: `components/settings/connected-accounts.tsx`
- Tests: `tests/security/instagram-token-refresh.test.ts`
- Environment defaults documented in `env.example`

## Key behaviors

- Renews tokens within 14 days of expiry.
- Uses atomic `FOR UPDATE SKIP LOCKED` claim to prevent concurrent renewal.
- Each account gets exactly one DB write per run, gated on
  `.eq("refresh_claim_token", claimToken)`. A worker whose lease went stale
  aborts that account instead of overwriting the newer owner's state.
- Distinguishes transient (retry with backoff) vs permanent (reconnect_required)
  failures.
- Too-new tokens are deferred, not marked invalid.
- Telegram alerts: permanent failures alert immediately (first occurrence);
  transient failures alert only after retries escalate. Both are deduplicated to
  at most one alert per account per 24h, and alert failures never break refresh
  state.
- `INSTAGRAM_TOKEN_REFRESH_MAX_RETRY_ATTEMPTS` is an *alert-escalation
  threshold*, not a retry cap. Retries continue indefinitely with exponential
  backoff capped at `maxRetryDelayHours` (12h).
- No token, secret, or raw Meta response is logged or returned.
- Client sanitizer exposes only `token_issued_at`, `token_refreshed_at`,
  `token_refresh_last_status`, `token_refresh_next_at`, `reconnect_required`.
  Tokens, `reconnect_reason`, provider errors, internal error codes, attempt
  counts, and alert bookkeeping stay server-side.
- Settings UI renders exactly one renewal notice (reconnect required > retry
  scheduled > expiring soon > healthy), so a green banner can never appear next
  to a retry warning.

## Verification (2026-08-04, local only)

- `npx vitest run tests/security/instagram-token-refresh.test.ts`: 69 passed.
- `npm run test:ci`: 76 files, 543 tests, all passed.
- `npx tsc --noEmit`: exit 0.
- ESLint on all changed TS/TSX files: 0 errors, 0 new warnings (4 pre-existing
  `_platform` unused-arg warnings in `lib/meta-account.ts` remain).
- `npm run build`: compiled successfully, exit 0.
- `deno check` skipped: Deno is not installed on this machine.
- No live Meta API calls were made; all provider interactions are faked.

Also fixed while verifying: `tests/security/credential-storage.test.ts` had a
latent flake (unrelated to this feature). It tampered with the *last* base64url
character of a v2 payload; that character can carry as few as 2 significant
bits, so the flip sometimes decoded to identical ciphertext and GCM
authentication legitimately passed. Now tampers one character in from the end,
which always mutates the ciphertext. Verified stable over 8 consecutive runs.

## Scheduler deployment gap (blocking — read before claiming this works)

Automatic renewal only runs if `scheduler-tick` is invoked **every minute**.
Every maintenance job, including this one, is dispatched from inside a
scheduler-tick run.

**There is no version-controlled schedule in this repository.** No `pg_cron`
migration exists (`supabase/migrations/` contains zero `cron.schedule` calls),
and there is no `supabase/config.toml` schedule block. The every-minute schedule
is created manually per environment and is not verifiable from the repo. A
`pg_cron` migration was deliberately **not** added: the repo has no established,
safe `pg_cron`/`pg_net` pattern to follow, and a correct schedule requires an
authorization secret that must never be committed to SQL.

Until the schedule below is confirmed in the target project, treat automatic
renewal as **not operational**.

### Required Supabase Cron configuration

Preferred: Supabase Dashboard → Integrations → Cron → Create job.

- Name: `scheduler-tick`
- Schedule: `* * * * *` (every minute)
- Type: Supabase Edge Function
- Function: `scheduler-tick`
- Method: `POST`
- Timeout: 5000 ms (or higher)
- HTTP headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
- Body: `{}`

Store the service-role key using the dashboard's secret/vault input. Do **not**
paste it into a migration, a committed SQL file, or `config.toml`.

If the schedule is instead created with `pg_cron` + `pg_net`, the secret must be
read at call time from Supabase Vault
(`select decrypted_secret from vault.decrypted_secrets where name = '...'`),
never inlined. Adding that pattern is a separate, deliberate infrastructure
change.

### Verification after configuring

1. Wait 2 minutes, then check the Cron job's run history for HTTP 200/207.
2. Edge Function logs for `scheduler-tick` should show one
   `[SCHEDULER_TICK] Job completed` line per minute.
3. At the next `:05`, `instagram-token-refresh` logs should show
   `[INSTAGRAM_TOKEN_REFRESH] Claimed accounts` followed by
   `[INSTAGRAM_TOKEN_REFRESH] Run complete` with a summary object.

## Deployment status

NOT deployed. Nothing in this work has been pushed, committed, merged, or
applied to any remote Supabase or Vercel resource.

Remaining steps, in order:

1. `supabase db push` (applies `20260804120000_add_instagram_token_refresh_locking.sql`).
2. `supabase functions deploy instagram-token-refresh --no-verify-jwt`.
3. `supabase functions deploy scheduler-tick`.
4. Set optional Edge Function secrets:
   `INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS`, `INSTAGRAM_TOKEN_REFRESH_MAX_ACCOUNTS`,
   `INSTAGRAM_TOKEN_REFRESH_TIMEOUT_MS`,
   `INSTAGRAM_TOKEN_REFRESH_MAX_RETRY_ATTEMPTS`.
5. Confirm the every-minute `scheduler-tick` Cron job exists (see above).
6. Deploy the Next.js app (sanitizer + Settings UI changes).

## Rollback

1. Remove the `tickMinute === 5` branch and the `instagram-token-refresh` job
   name from `scheduler-tick/index.ts`, then redeploy scheduler-tick. This alone
   stops all automatic renewal; the rest is inert.
2. Delete the Edge Function: `supabase functions delete instagram-token-refresh`.
3. Delete `supabase/functions/instagram-token-refresh/` and the two
   `_shared/instagram-token-refresh-*.ts` modules (the manual refresh route
   imports the policy/state modules — revert that route first).
4. Revert `app/api/auth/instagram/refresh/route.ts`,
   `app/api/auth/instagram/callback/route.ts`, `lib/instagram-onboarding.ts`,
   `lib/meta-account.ts`, `components/settings/connected-accounts.tsx`,
   `env.example`, and `tests/security/instagram-token-refresh.test.ts`. Delete
   `lib/instagram-token-renewal-notice.ts`.
5. Database: the migration is additive (two nullable columns, one partial index,
   one function). Leaving it in place is safe. To reverse it, write a new
   forward migration:
   `drop function if exists public.claim_due_instagram_token_refreshes(uuid, integer, integer, integer);`
   `drop index if exists public.idx_social_accounts_instagram_refresh_claimed;`
   `alter table public.social_accounts drop column if exists refresh_claim_token, drop column if exists refresh_claimed_at;`
   Do not edit the applied migration file — migrations are append-only here.
6. Metadata written by the worker (`token_refresh_*`, `reconnect_required`) is
   additive JSON and harmless if left behind.

## Open loops resolved

- Automatic Instagram token renewal gap is closed in code.
- Remaining open loop: the every-minute `scheduler-tick` Cron schedule must be
  configured and verified per environment. Not code, not resolvable from the
  repository.
