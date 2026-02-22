# Meta App Review Readiness (A to Z)

This document is the engineering checklist to prepare the app for Meta App Review with low rejection risk.

It is based on the current codebase (OAuth, posting, webhooks, comments/messages, automations, analytics).

## Status Summary (Current)

- `Not review-ready for full permission set yet`
- `Good foundation`: OAuth + page selection + posting + webhooks + automations exist
- `Main risk`: requesting more permissions than the most stable flows can reliably demonstrate

## Recommended Submission Strategy (Phased)

### Phase 1 (submit first)

- `public_profile`
- `pages_show_list`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

Why first:
- These map to the strongest, most deterministic flows (connect page/account + publish content).

### Phase 2 (after hardening comments/messages)

- `instagram_manage_comments`
- `instagram_manage_messages`
- `pages_read_engagement` (if needed for message/comment reads in your exact endpoints)
- `pages_messaging` (currently not requested but code indicates it is needed for IG DM sync)

Why phase 2:
- Messaging and webhook-dependent flows are harder to demonstrate consistently and need cleaner permission handling.

### Phase 3 (after analytics fully stable)

- `instagram_manage_insights`
- `pages_read_engagement` (if you want to submit analytics features here instead)

Why phase 3:
- Analytics sync/storage/UI are still being stabilized and are not ideal as a first review submission target.

## P0 Code Fixes (Do Before Any Review Submission)

### 1) Unify OAuth scope source and remove drift

Current issue:
- There are two Meta OAuth flows with different scope definitions and API versions.

Files:
- `utils/meta-oauth.ts`
- `app/api/auth/social/connect/[platform]/route.ts`
- `app/api/auth/social/callback/route.ts`
- `app/api/auth/meta/login/route.ts`
- `app/api/auth/meta/callback/route.ts`

Why it matters:
- Reviewer flow must be deterministic. Different auth routes requesting different scopes will create inconsistent behavior and rejections.

Required fix:
- Choose one production Meta OAuth flow (recommended: the newer `app/api/auth/meta/*` flow).
- Mark the legacy social flow as deprecated or remove it from UI.
- Keep one canonical scope builder and one API version policy.

### 2) Add scope-based feature gating in UI and backend

Current issue:
- Features can fail at runtime with Graph API errors instead of showing permission-specific messages.

Files to cover first:
- `app/api/live-messages/route.ts`
- `app/api/live-messages/send/route.ts`
- `app/api/messages/route.ts`
- `app/api/posts-media/comments/route.ts`
- `app/api/sync-analytics/route.ts`
- `supabase/functions/sync-messages/index.ts`
- `supabase/functions/sync-analytics/index.ts`

Required fix:
- Detect and surface missing permissions explicitly (backend error normalization + UI message).
- Disable/hide unsupported actions when permissions are missing.

### 3) Fix messaging permission mismatch (`pages_messaging`)

Current issue:
- `supabase/functions/sync-messages/index.ts` explicitly notes IG message sync requires `instagram_manage_messages + pages_messaging`.
- Main OAuth scope list in `utils/meta-oauth.ts` does not include `pages_messaging`.

Files:
- `supabase/functions/sync-messages/index.ts:83`
- `utils/meta-oauth.ts:15`

Decision required:
- If IG DM sync is part of review scope, add the required page messaging permission and document it.
- If not, remove DM features from review scope and gate them in UI.

### 4) Update reviewer documentation to match current code paths

Current issue:
- `docs/meta-app-review-submission.md` references outdated paths (example: `app/api/comments/route.ts`).

Files:
- `docs/meta-app-review-submission.md`
- Current comments route is `app/api/posts-media/comments/route.ts`

Required fix:
- Refresh all file references, endpoint descriptions, and reviewer steps to match the current implementation.

Status:
- `In progress` (comments flow references and reviewer steps updated to `app/api/posts-media/comments/route.ts` and the post comments drawer flow)

### 5) Standardize Meta Graph API versions

Current issue:
- Codebase mixes `v19.0`, `v21.0`, and `v24.0`.

Files (examples):
- `app/api/auth/meta/callback/route.ts` (`v24.0`)
- `utils/meta-publish.ts` (`v24.0`)
- `supabase/functions/process-scheduled-posts/index.ts` (`v24.0`)
- `app/api/posts-media/route.ts` (`v21.0`)
- `app/api/live-messages/route.ts` (`v21.0`)
- `supabase/functions/sync-analytics/index.ts` (`v21.0`)

Why it matters:
- Review and debugging become harder when endpoint behavior differs across versions.

Required fix:
- Define one supported version policy (or a small intentional split).
- Document any exceptions (for example, analytics metric compatibility).

## P1 Hardening (Before Submitting Comments / Messaging / Automations)

### 6) Webhook delivery hardening and observability

Strengths already present:
- Signature verification (`x-hub-signature-256`)
- Constant-time comparison
- Idempotency keying + duplicate skip
- Non-2xx responses for retry behavior

File:
- `app/api/webhooks/instagram/route.ts`

Still needed:
- Reviewer-safe error messages in logs (no token leakage)
- Event-type success/failure counters (comment/message/mention/story reply)
- A clear admin/debug page or SQL query pack for webhook verification during testing

### 7) Automation reviewer flow hardening

Files:
- `supabase/functions/automation-orchestrator/index.ts`
- `supabase/functions/process-automations/graph-executor.ts`
- `supabase/functions/automation-worker-reply-comment/index.ts`
- `supabase/functions/automation-worker-send-dm/index.ts`
- `supabase/functions/automation-worker-private-reply/index.ts`

Required fix:
- Clear per-node execution result tracking visible in UI (success/fail for reply, DM, AI response)
- Permission-specific failure messages for messaging/reply actions
- A reviewer demo template automation (prebuilt, minimal, deterministic)

### 8) Comments management UX hardening

File:
- `app/api/posts-media/comments/route.ts`

Required fix:
- Distinguish read/reply/hide failures by permission vs token vs unsupported object
- Ensure UI messages are explicit and consistent

Status:
- `Partially done` (backend normalized Meta errors + comments drawer permission/auth gating added)
- Remaining: validate Facebook comment permission combinations in production reviewer flow

## P1 Hardening (Before Submitting Analytics / Insights)

### 9) Finish analytics reliability (sync -> DB -> API -> UI)

Files:
- `supabase/functions/sync-analytics/index.ts`
- `app/api/sync-analytics/route.ts`
- `app/api/analytics/route.ts`
- `app/dashboard/analytics/page.tsx`

Required fix:
- Confirm direct/native post ingestion consistently populates `published_posts` and `post_analytics`
- Confirm analytics UI reflects synced rows without demo fallback behavior
- Add a visible last-sync status and sync result summary in UI

### 10) Decide analytics review scope precisely

Current risk:
- "Analytics" is too broad. Reviewers expect exact, demonstrable metrics.

Required fix:
- Explicitly list supported metrics by platform in UI/docs:
  - account followers
  - likes/comments/shares
  - views/reach if available
- Hide unavailable metrics instead of showing zeros without explanation

## P2 Security / Compliance / Review Operations

### 11) Token and logging hygiene

Required fix:
- Audit logs for accidental token fragments in errors/debug output
- Keep enough logs for support, but never log full access tokens or raw secrets

### 12) Production-only review path validation

Required fix:
- Validate all callbacks/webhooks/edge calls on production domain
- Eliminate localhost-only assumptions from reviewer instructions

### 13) Reviewer package completeness

Required fix:
- Public `Privacy Policy`
- Public `Terms`
- Public `Data Deletion` URL/instructions
- Reviewer test credentials
- Pre-connected test Page + IG account (or clear connection steps)
- One short screencast per permission group

## File-Level Audit Checklist (Concrete)

### OAuth / Account Connection

- `utils/meta-oauth.ts`
  - Convert to phase-based scope builder (review profile vs full internal profile)
  - Optionally record granted scopes from `debug_token` in DB for feature gating
- `app/api/auth/meta/callback/route.ts`
  - Persist granted scopes/debug result (sanitized) to help support/review diagnostics
  - Normalize error responses for missing page list / IG account
- `app/api/auth/meta/select-page/route.ts`
  - Keep current 1 FB + 1 IG behavior, but add explicit reviewer-facing success/failure messages in UI

### Posting / Scheduling

- `utils/meta-publish.ts`
  - Ensure errors returned are normalized (permission denied, media invalid, processing timeout)
- `supabase/functions/process-scheduled-posts/index.ts`
  - Improve per-post failure logging and user-visible status mapping

### Comments / Messaging

- `app/api/posts-media/comments/route.ts`
  - Add permission-aware error classification
- `app/api/live-messages/route.ts`
  - Add explicit unsupported/missing-permission messages
- `app/api/live-messages/send/route.ts`
  - Same as above
- `supabase/functions/sync-messages/index.ts`
  - Resolve permission mismatch (`pages_messaging`) and formalize behavior when not granted

### Webhooks / Automations

- `app/api/webhooks/instagram/route.ts`
  - Add per-event summary logs and sanitized failure reasons
- `supabase/functions/automation-orchestrator/index.ts`
  - Add stronger event outcome logging for review demos
- `supabase/functions/process-automations/graph-executor.ts`
  - Surface node-level failures in a structured way

### Analytics

- `supabase/functions/sync-analytics/index.ts`
  - Finalize direct sync reliability and explicit metric capability handling
- `app/api/analytics/route.ts`
  - Keep admin reads (already improved) and explain unavailable metrics in `_meta`
- `app/dashboard/analytics/page.tsx`
  - Display "partial analytics" / "missing permissions" states clearly

## Review Readiness Exit Criteria (Definition of Done)

You are ready to submit a phase when all are true:

- Every requested permission has a working, reviewer-demonstrable UI flow
- Every permission is mapped to exact code paths and Graph endpoints
- No generic 500/401 errors appear in the reviewer flow
- Reviewer docs and screencast match current code paths exactly
- Production domain flow works end-to-end (not localhost)

## Next Engineering Task (Recommended)

Create a `review profile` scope mode and feature gating first.

Why first:
- It reduces rejection risk immediately
- It lets us submit Phase 1 while Phase 2/3 are still being hardened
- It prevents reviewer exposure to unstable features
