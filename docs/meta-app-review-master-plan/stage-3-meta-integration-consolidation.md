# Stage 3: Meta Integration Consolidation

Status: `done`

Depends on: `Stage 2`

## Goal

Make Meta integration deterministic and maintainable.

## Required Work

1. Keep only the canonical Meta OAuth flow:
   - `/api/auth/meta/login`
   - `/api/auth/meta/callback`
   - `/api/auth/meta/select-page`
2. Remove or hard-disable:
   - `/api/auth/social/connect/[platform]`
   - `/api/auth/social/callback`
3. Create one shared scope builder and one shared version policy
4. Migrate all active code paths to one verified Graph API version family
5. Persist granted scopes and granular scopes from `debug_token`

## Progress

- Legacy `/api/auth/social/connect/[platform]` is hard-disabled
- Legacy `/api/auth/social/callback` is hard-disabled
- Shared Meta Graph version constants added for Next.js/server and edge runtimes
- Active `v24.0`, `v19.0`, and `v18.0` usages were removed from active code paths in favor of `v21.0`
- Reviewer package and env examples were aligned to the canonical Phase 1 Meta flow
- Reviewer-facing submission materials now live under `docs/app-review/`

## Primary Files

- `utils/meta-oauth.ts`
- `app/api/auth/meta/*`
- `app/api/auth/social/*`
- `lib/meta-api-client.ts`
- Meta API routes and Supabase functions with hardcoded versions

## Exit Gate

- One canonical OAuth flow
- One canonical scope builder
- One verified Graph API version policy
- No expired Graph version remains in active code
- Reviewer docs match the active canonical flow

## Locked Output

Later stages must build on the canonical OAuth and versioning rules, not fork them again.
