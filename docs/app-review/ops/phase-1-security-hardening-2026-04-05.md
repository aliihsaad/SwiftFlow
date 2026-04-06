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

11. Stopped returning decrypted AI provider keys to the browser
- Updated:
  - `types/settings.ts`
  - `app/actions/settings.ts`
  - `app/dashboard/settings/page.tsx`
  - `app/api/workspace/settings/route.ts`
  - `components/settings/api-settings-form.tsx`
- Fix:
  - browser-facing workspace settings now return `has_openrouter_api_key`, `has_gemini_api_key`, and `has_openai_api_key` flags instead of decrypted secret values
  - the settings page now loads a display-safe settings object for serialization to the client
  - the workspace settings API route now returns masked key state instead of plaintext API keys on both `GET` and `PUT`
  - the AI Provider form now uses a secure “saved key / replace key” flow, so users can keep an existing key without re-exposing it in the browser
- Risk reduced:
  - authenticated client-side disclosure of stored provider credentials
  - accidental plaintext key exposure in serialized React props and settings API responses

12. Locked AI key validation behind authenticated workspace settings access
- Updated:
  - `app/api/ai/validate-key/route.ts`
- Fix:
  - the key-validation endpoint now requires an authenticated user, an active workspace, and `settings:write` permission before it will validate any provider key
  - requests now enforce a small body-size limit, validate the provider value, reject oversized key input, and URL-encode Gemini API keys before provider validation calls
- Risk reduced:
  - unauthenticated API-key validation abuse
  - public provider-key oracle behavior
  - query-parameter injection through the Gemini validation branch

13. Blocked private and local media URLs in posts and the publish worker
- Updated:
  - `lib/security/phase1-validation.ts`
  - `app/api/posts/route.ts`
  - `supabase/functions/process-scheduled-posts/index.ts`
- Fix:
  - post create/update now reject media URLs that point to localhost, private IPv4 ranges, local/internal hostnames, or credentialed URLs
  - the scheduler worker now re-validates stored media URLs before publishing and fails the post safely if any unsafe media URL is present
- Risk reduced:
  - stored SSRF-style payloads through `mediaUrls[]`
  - legacy unsafe media URLs being replayed by the background publish worker

14. Reduced authentication error disclosure in the web UI
- Updated:
  - `app/login/page.tsx`
- Fix:
  - sign-in failures now return a generic authentication error instead of surfacing raw upstream Supabase messages
  - sign-up failures now return a neutral message instead of echoing provider-side failure details into the UI
- Risk reduced:
  - auth error detail leakage in the browser
  - lower-signal feedback for UI-driven account probing

15. Added baseline edge security headers
- Updated:
  - `proxy.ts`
- Fix:
  - responses now include `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`
  - production responses now include HSTS
- Risk reduced:
  - clickjacking
  - MIME-sniffing
  - unnecessary browser feature exposure
  - downgrade risk on production HTTPS

16. Restricted password reset to the recovery flow
- Updated:
  - `app/auth/callback/route.ts`
  - `app/api/auth/recovery-session/route.ts`
  - `app/reset-password/page.tsx`
  - `components/auth/reset-password-form.tsx`
- Fix:
  - the password reset page now requires a short-lived server-side recovery cookie set only after a successful auth callback into `/reset-password`
  - successful password resets clear the recovery cookie immediately
- Risk reduced:
  - normal authenticated sessions reaching the recovery-only password reset page
  - bypass of the intended “current password required” account-settings flow

17. Added server-side password verification for account-sensitive actions
- Updated:
  - `app/actions/auth.ts`
  - `components/settings/account-settings-section.tsx`
- Fix:
  - account password changes now verify the current password through a server action instead of using a second browser sign-in flow
  - account deletion now requires current-password re-entry before any destructive operation begins
  - account deletion now fails early on membership/workspace cleanup errors instead of deleting the auth user after partial database failures
- Risk reduced:
  - brittle client-side password verification behavior
  - destructive account deletion without re-authentication
  - orphaned workspace data after partial delete failures

## Verification

- `npx tsc --noEmit --pretty false`
- targeted lint/type review on the touched routes and function

## Follow-up Deployment Requirement

After these changes are committed, `process-scheduled-posts` must be redeployed so the new internal auth check is live.

## Remaining External/Auth Controls

Some findings from the Shannon report are only partially addressable inside this repo because they stem from the current Supabase browser-auth architecture:

- The public anon key is still intentionally exposed to the browser for Supabase client usage.
- Supabase auth endpoints remain publicly reachable outside the app domain.
- Supabase SSR defaults still use non-HttpOnly auth cookies for browser session continuity.

Repo-side mitigations were applied where they do not break the current Phase 1 review flow, but full closure of those findings would require a larger auth-architecture change and/or Supabase dashboard controls such as bot protection / CAPTCHA and stricter auth-service policy configuration.
