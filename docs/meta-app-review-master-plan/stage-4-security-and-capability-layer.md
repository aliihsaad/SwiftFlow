# Stage 4: Security and Capability Layer

Status: `not_started`

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
- `supabase/functions/_shared/secret-crypto.ts`
- `app/api/auth/meta/select-page/route.ts`
- `app/api/auth/meta/callback/route.ts`
- `social_accounts` and `oauth_page_sessions` schema/migrations

## Exit Gate

- Meta tokens encrypted at the app layer
- Granted scopes persisted
- Capability registry live
- Env/secret loading normalized

## Locked Output

Later stages must rely on the capability layer instead of permission-guessing or runtime surprises.
