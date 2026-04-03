# Stage 4: Security and Capability Layer

Status: `in_progress`

Depends on: `Stage 3`

## Goal

Make permissions, token handling, and feature availability explicit and safe.

## Required Work

1. Encrypt Meta tokens at the application layer
2. Add a token accessor layer so routes/functions do not read raw DB token fields directly
3. Persist granted scopes and derived capabilities per connected account
4. Normalize env and secret loading across Next.js routes and edge functions
5. Remove raw token values from logs and error payloads

## Recommended Data Additions

- `granted_scopes`
- `granted_granular_scopes`
- `capabilities`
- `last_scope_sync_at`
- `token_status`

## Primary Files

- `lib/secret-crypto.ts`
- `lib/meta-account.ts`
- `supabase/functions/_shared/secret-crypto.ts`
- `supabase/functions/_shared/meta-account.ts`
- `app/api/auth/meta/select-page/route.ts`
- `app/api/auth/meta/callback/route.ts`
- `social_accounts` and `oauth_page_sessions` schema/migrations

## Progress

- Canonical Meta connect flow now encrypts page tokens before storing them in `oauth_page_sessions`
- Canonical Meta page selection now encrypts stored `social_accounts.access_token` values at the application layer
- Granted scopes, granular scopes, derived capabilities, token status, and scope sync timestamps are now written into `social_accounts.metadata`
- Shared Meta account helpers were added for Next.js and Supabase edge runtimes
- Active publish paths now decrypt tokens through the shared accessor layer instead of reading raw database values directly
- Active message, comment, automation, webhook, and analytics sync loaders now hydrate Meta accounts through the shared decrypt/accessor layer
- Read-only analytics routes now avoid unnecessary `social_accounts.access_token` reads when they only need metadata and platform state
- `sync-analytics` runtime logs now summarize Meta failures instead of dumping raw provider payloads
- `review_phase_1` webhook deliveries are now acknowledged without executing message/comment/automation side effects
- Remaining Stage 4 work is expanding the accessor layer and token redaction rules across the last legacy holdouts and normalizing secret handling outside the Meta path

## Exit Gate

- Meta tokens encrypted at the app layer
- Granted scopes persisted
- Capability registry live
- Env/secret loading normalized

## Locked Output

Later stages must rely on the capability layer instead of permission-guessing or runtime surprises.
