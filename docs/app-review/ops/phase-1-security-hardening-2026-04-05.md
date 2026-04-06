# Phase 1 Security Hardening

Date: `2026-04-05`

This note records the post-submission security and bug fixes applied to the Phase 1 review candidate without changing the visible reviewer flow.

## Fixed Issues

1. Removed the live debug database route
- Disabled `app/api/test-db/route.ts` so it no longer exposes any service-role behavior
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

6. Added strict request validation to Phase 1 write paths
- Added `lib/security/phase1-validation.ts`
- Updated:
  - `app/api/brand-profile/route.ts`
  - `app/api/posts/route.ts`
  - `app/api/ai/generate-caption/route.ts`
  - `app/api/assistant/invoke/route.ts`
- Fix:
  - brand profile updates now use a strict field whitelist instead of passing the raw request body into the database update/insert
  - post creation and update requests now normalize and validate IDs, platforms, status values, scheduled timestamps, captions, and media URLs before any database write
  - AI caption requests now validate workspace IDs, platform arrays, tone values, and request size before invoking the edge function
  - assistant proxy requests now validate the allowed function payload shape and reject oversized or malformed bodies before forwarding them
- Risk reduced:
  - mass assignment through JSON bodies
  - malformed payloads reaching database writes
  - oversized AI request bodies and unsafe assistant proxy forwarding

7. Hardened Meta page-selection session endpoints
- Updated:
  - `app/api/auth/meta/page-session/route.ts`
  - `app/api/auth/meta/select-page/route.ts`
- Fix:
  - `sessionId` is now validated as a UUID before lookup
  - `selectedPageId` is now validated as a Meta numeric account/page ID
  - temporary session `pages_data` is sanitized before it is used or returned to the UI
  - invalid page-session payloads now fail as `400` instead of falling through to generic server errors
- Risk reduced:
  - malformed page-selection payloads
  - unsafe trust of session JSON blobs
  - confusing 500s on invalid client input

8. Hardened workspace settings and assistant chat-session persistence
- Updated:
  - `app/api/workspace/settings/route.ts`
  - `app/api/chat/sessions/route.ts`
  - `app/api/chat/sessions/[id]/route.ts`
- Fix:
  - workspace settings now validate `workspaceId`, clamp model/provider/key fields, and only persist the allowed settings keys
  - chat session create/update routes now validate session IDs, cap payload size, sanitize persisted message history, and stop accepting arbitrary `...body` updates
- Risk reduced:
  - settings mass assignment
  - oversized session payload writes
  - unsafe JSON persistence from assistant/session requests

9. Blocked Meta Graph path traversal through comment and automation IDs
- Updated:
  - `lib/security/phase1-validation.ts`
  - `app/api/posts-media/comments/route.ts`
  - `app/api/automations/route.ts`
  - `app/api/automations/[id]/route.ts`
  - `app/api/automations/validate/route.ts`
  - `supabase/functions/_shared/meta-graph.ts`
  - `supabase/functions/process-automations/index.ts`
  - `supabase/functions/sync-comments/index.ts`
- Fix:
  - strict Meta object ID validation now rejects malformed `postId`, `commentId`, `platform_post_id`, and comment-trigger `post_id` values before any Meta Graph URL is assembled
  - automation create/update and design-time validation now reject comment-trigger post IDs that are not valid Meta object IDs
  - background automation/comment sync workers now skip unsafe stored IDs instead of issuing outbound Meta requests with them
- Risk reduced:
  - Meta Graph path/query injection through crafted object IDs
  - stored traversal payloads being replayed by background workers
  - comment-management endpoints acting as indirect data exfiltration proxies

10. Disabled the automation HTTP request worker
- Updated:
  - `supabase/functions/automation-worker-http-request/index.ts`
- Fix:
  - the worker now rejects all invocations and no longer performs arbitrary outbound `fetch()` calls
  - this matches the existing product state where `action_http_request` is already marked temporarily disabled in the canvas validator/executor
- Risk reduced:
  - unrestricted SSRF through automation workflows
  - internal network probing or metadata-service access through user-configured URLs

## Verification

- `npx tsc --noEmit --pretty false`
- targeted lint/type review on the touched routes and function

## Follow-up Deployment Requirement

After these changes are committed, `process-scheduled-posts` must be redeployed so the new internal auth check is live.
