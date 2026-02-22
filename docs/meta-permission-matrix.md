# Meta Permission Matrix (Code-Backed)

Purpose:
- Map each Meta permission to a real feature, code path, and Graph API endpoint in this repo.
- Decide what to include in the first Meta App Review submission.

Status labels:
- `Stable` = good candidate for review
- `Partial` = implemented but needs hardening / clearer error handling
- `Unstable` = do not submit yet
- `Missing` = code expects it but OAuth flow does not request it

## Current OAuth Scope Sources

Primary shared Meta flow:
- `utils/meta-oauth.ts:15` (`META_SCOPE`)

Legacy/alternate social connect flow (scope drift risk):
- `app/api/auth/social/connect/[platform]/route.ts`

## Permission Matrix

| Permission | Requested Now | Feature(s) | Graph Endpoint(s) in Code | Main Code Paths | Review Status | Action |
|---|---:|---|---|---|---|---|
| `public_profile` | Yes | OAuth base login/profile | OAuth dialog + token/debug flow | `utils/meta-oauth.ts`, `app/api/auth/meta/callback/route.ts` | Stable | Keep in all phases |
| `pages_show_list` | Yes | List Facebook Pages for selection | `GET /me/accounts` | `app/api/auth/meta/callback/route.ts:97`, `app/api/auth/meta/select-page/route.ts` | Stable | Phase 1 |
| `pages_manage_posts` | Yes | Publish to FB page now/scheduled | `POST /{page-id}/feed`, `POST /{page-id}/photos`, `POST /{page-id}/videos` | `utils/meta-publish.ts`, `supabase/functions/process-scheduled-posts/index.ts` | Partial | Phase 1 after error normalization |
| `instagram_basic` | Yes | Discover linked IG account, read IG media/basic metadata | `GET /{page-id}?fields=instagram_business_account`, `GET /{ig-user-id}/media...` | `app/api/auth/meta/callback/route.ts:170`, `app/api/posts-media/route.ts`, `app/api/automations/instagram-media/route.ts` | Stable | Phase 1 |
| `instagram_content_publish` | Yes | Publish IG posts now/scheduled | `POST /{ig-user-id}/media`, `POST /{ig-user-id}/media_publish`, `GET /{container-id}?fields=status_code` | `utils/meta-publish.ts`, `supabase/functions/process-scheduled-posts/index.ts` | Partial | Phase 1 after improved failure states |
| `instagram_manage_comments` | Yes | Read/reply/hide IG comments, comment automations | `GET /{media-id}/comments`, `POST /{comment-id}/replies`, `POST /{comment-id}?hide=true` | `app/api/posts-media/comments/route.ts`, `supabase/functions/sync-comments/index.ts`, automation worker / graph executor | Partial | Phase 2 (or Phase 1 only if reviewer flow is fully stable) |
| `instagram_manage_messages` | Yes | IG DM sync/send, DM automations | `GET /{page-id}/conversations?platform=instagram`, `GET /{conversation-id}/messages`, `POST /{page-id}/messages` | `app/api/live-messages/route.ts`, `app/api/live-messages/send/route.ts`, `app/api/messages/route.ts`, `supabase/functions/sync-messages/index.ts`, automation workers | Partial | Phase 2 after permission gating and scope alignment |
| `instagram_manage_insights` | Yes | IG account/post analytics | `GET /{ig-user-id}?fields=followers_count,follows_count,media_count`, `GET /{media-id}`, `GET /{media-id}/insights` | `supabase/functions/sync-analytics/index.ts`, `app/api/analytics/route.ts` | Unstable | Phase 3 |
| `pages_read_engagement` | Yes | FB follower/post engagement reads, FB comments/media reads in some paths | `GET /{page-id}?fields=fan_count,followers_count`, `GET /{page-id}/posts...`, `GET /{post-id}` metrics, FB comments endpoints | `supabase/functions/sync-analytics/index.ts`, `app/api/posts-media/route.ts`, `app/api/posts-media/comments/route.ts` | Partial | Keep only if submitted features are stable; otherwise defer with analytics |
| `pages_messaging` | No | IG DM sync via Page conversations endpoint (code comment says required) | `GET /{page-id}/conversations?...platform=instagram`, `POST /{page-id}/messages` | `supabase/functions/sync-messages/index.ts:83`, messaging routes/workers | Missing | Add if DMs are in review scope, otherwise gate DM features out |

## Important Gaps / Risks Found in Code

### 1) Scope mismatch for messaging

- `supabase/functions/sync-messages/index.ts:83` says IG message sync requires `pages_messaging`.
- `utils/meta-oauth.ts:15` does not request `pages_messaging`.

Impact:
- Messaging review flow can fail even if `instagram_manage_messages` is granted.

### 2) OAuth flow drift (two scope sources)

- Shared Meta flow and legacy social connect flow define scopes separately.
- This creates inconsistent reviewer behavior depending on which UI path is used.

Impact:
- Permission set may differ unexpectedly during review.

### 3) Analytics feature breadth is larger than current reliability

- Analytics pipeline exists, but full cross-platform metrics are still partial.
- Some metrics are intentionally zeroed/fallback depending on endpoint availability.

Impact:
- Do not market broad analytics in review unless the exact metrics shown are clearly supported and stable.

## Reviewer Demonstration Mapping (Recommended)

## Phase 1 demo mapping

- `pages_show_list` -> connect flow page list
- `instagram_basic` -> linked IG account detection during page selection
- `pages_manage_posts` -> FB publish now
- `instagram_content_publish` -> IG publish now / scheduled publish

Exclude from first video:
- messaging
- automations that depend on messaging
- analytics insights claims beyond basic counts

## Phase 2 demo mapping

- `instagram_manage_comments` -> sync comments + reply + hide
- `instagram_manage_messages` + `pages_messaging` -> sync conversation + send DM + DM automation
- webhook-triggered automations (comment/message) after deterministic demo automation setup

## Phase 3 demo mapping

- `instagram_manage_insights` -> account/post metrics visible in analytics
- `pages_read_engagement` -> FB follower/post engagement metrics in analytics and post lists

## Code Work Needed To Make Matrix Review-Safe

### Scope control

- Build one canonical scope generator (`review profile` vs `full internal profile`)
- Use it in all Meta auth entry points

### Permission-aware backend errors

- Normalize Meta Graph errors into:
  - `missing_permission`
  - `token_expired`
  - `invalid_token`
  - `unsupported_feature`
  - `not_connected`

### UI feature gating

- Hide or disable tabs/actions based on granted scopes (or show a clear upgrade/reconnect prompt)

### Documentation sync

- Update `docs/meta-app-review-submission.md` to reflect current routes:
  - comments route is `app/api/posts-media/comments/route.ts` (not `app/api/comments/route.ts`)
  - current analytics and automation function names

## Quick Decision Table (Use This Now)

If you want fastest approval path:
- Submit `Phase 1` first
- Remove messaging + analytics permissions from initial review
- Add them only after code hardening and reviewer demos are stable

If you want "all-in-one" review:
- Expect more code work and higher rejection risk
- Must fix `pages_messaging` gap first
- Must complete analytics reliability and permission-aware UX

