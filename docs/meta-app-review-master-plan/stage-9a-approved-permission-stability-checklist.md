# Stage 9A: Approved-Permission Stability Checklist

Status: `in_progress`

Last updated: 2026-04-30

## Goal

Stabilize all flows that depend only on already-approved Meta permissions before building Phase 2 publishing automation or preparing the next permission review package.

Approved permissions in scope:

- `public_profile`
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

## First Pass Fixes

Completed on 2026-04-30:

- Meta capability checks now fail closed when account scope/capability metadata is missing.
- Next.js and Supabase Edge helpers now agree that missing capability metadata means reconnect is required, not publish-ready.
- Supabase Edge capability derivation now includes granular scopes when calculating effective Meta capabilities.
- Supabase Edge Facebook connected-media readiness now requires `pages_read_engagement` capability instead of accepting only Page selection or publish capability.
- Next.js Meta Graph error normalization now supports publishing failures and maps publish permission errors to `pages_manage_posts` or `instagram_content_publish`.

Primary files changed:

- `lib/meta-account.ts`
- `lib/meta-graph-errors.ts`
- `supabase/functions/_shared/meta-account.ts`

## Required Stability Checks

### 1. Meta Connect And Reconnect

- Connect a Facebook Page and linked Instagram Business account from Brand Settings.
- Confirm granted scopes are stored on each `social_accounts.metadata.granted_scopes`.
- Confirm derived `metadata.capabilities` includes:
  - `facebook_page_selection`
  - `facebook_publish`
  - `instagram_basic`
  - `instagram_publish`
  - `analytics_read` when `pages_read_engagement` is granted
- Reconnect an existing account and confirm stale missing-scope warnings clear after the callback.
- Test a legacy account with missing metadata and confirm UI requires reconnect rather than showing publish-ready.

### 2. Publish Now

- Create a Facebook text post and publish now.
- Create a Facebook media post and publish now.
- Create an Instagram media post and publish now.
- Confirm publish-now creates a scheduled row with `scheduled_for` near now and triggers `process-scheduled-posts`.
- Confirm successful publishes create `published_posts` rows with platform IDs and account linkage.

### 3. Scheduled Publishing

- Schedule one Facebook post and one Instagram post in the future.
- Run `scheduler-tick` or `process-scheduled-posts`.
- Confirm only due posts are claimed and moved from `scheduled` to `publishing`.
- Confirm success changes status to `published`.
- Confirm partial platform failure changes status to `failed` with `last_publish_results`.

### 4. Failure Recovery

- Test a missing-token account.
- Test an account missing `pages_manage_posts`.
- Test an Instagram post without media.
- Test invalid/private media URLs.
- Confirm failures store:
  - `last_publish_error_code`
  - `last_publish_error_message`
  - `last_publish_attempted_at`
  - `last_publish_results`
- Confirm failed rows are visible from the scheduled/failed tab and can be retried only after correction.

### 5. Facebook Page Read And Content Library

- Load Facebook native Page posts with `pages_read_engagement`.
- Confirm `/posts-media?platform=facebook` returns native Page posts without requesting engagement summary fields.
- Confirm app-managed Facebook posts are labeled separately from native discovered posts.
- Revoke or simulate missing `pages_read_engagement` and confirm cached/app-managed fallback is returned without stale counts.

### 6. Permission-State UI

- Brand Settings must show reconnect-required state when capabilities are missing or false.
- Dashboard health card must not show publish-ready for legacy accounts missing scope metadata.
- Posts and analytics surfaces must suppress stale SWR/media/count data after permission failures.
- Missing-scope messages must name the exact permission needed.

## Verification Status

Static verification:

- `npx eslint lib/meta-account.ts lib/meta-graph-errors.ts` passed.
- `npx tsc --noEmit --pretty false` passed.
- Full `npm run lint` is not a usable gate yet because the repo has existing broad lint debt unrelated to this Phase 2 slice.

Live verification:

- Pending. Requires connected Meta test accounts and deployed Supabase Edge functions.

## Exit Gate

Stage 9A is complete when:

- Approved connect/reconnect, publish-now, scheduled publish, and Facebook Page read flows pass live testing.
- Missing or stale Meta permissions fail closed with clear reconnect guidance.
- Background workers and UI capability checks produce the same readiness state.
- No new permission review prep starts until this checklist is complete.
