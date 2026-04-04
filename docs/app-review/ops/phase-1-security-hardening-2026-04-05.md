# Phase 1 Security Hardening

Date: `2026-04-05`

This note records the post-submission security and bug fixes applied to the Phase 1 review candidate without changing the visible reviewer flow.

## Fixed Issues

1. Removed the live debug database route
- Deleted `app/api/test-db/route.ts`
- Risk removed: unauthenticated service-role read/write access to `social_accounts`

2. Hardened Meta OAuth state handling
- Updated `app/api/auth/meta/login/route.ts`
- Updated `app/api/auth/meta/callback/route.ts`
- Updated `utils/meta-oauth.ts`
- Fix:
  - Meta OAuth no longer places the raw `workspaceId` directly in the callback `state`
  - login now stores an httpOnly state cookie with nonce + workspace binding
  - callback validates the nonce against the cookie before using the workspace binding
- Risk removed: workspace-binding CSRF / tampered callback state

3. Scoped post updates to the active workspace
- Updated `app/api/posts/route.ts`
- Fix:
  - `PUT /api/posts` now filters by both `id` and `workspace_id`
  - `Post Now` trigger now uses the admin client for the internal edge invocation path
- Risk removed: cross-workspace post update by UUID

4. Aligned review OAuth scopes with the submitted permission set
- Updated `utils/meta-oauth.ts`
- Fix:
  - `review_phase_1` now requests:
    - `public_profile`
    - `pages_show_list`
    - `pages_read_engagement`
    - `pages_manage_posts`
    - `instagram_basic`
    - `instagram_content_publish`
- Risk removed: reconnect flow asking for a narrower scope set than the app review submission

5. Added internal auth to `process-scheduled-posts`
- Updated `supabase/functions/process-scheduled-posts/index.ts`
- Updated `supabase/functions/README.md`
- Fix:
  - the function now requires the caller `apikey` header to match `SUPABASE_SERVICE_ROLE_KEY`
  - this preserves the current internal invocation model while preventing anonymous external triggering
- Risk reduced: public no-JWT scheduler endpoint abuse

## Verification

- `npx tsc --noEmit --pretty false`
- targeted lint/type review on the touched routes and function

## Follow-up Deployment Requirement

After these changes are committed, `process-scheduled-posts` must be redeployed so the new internal auth check is live.
