# Review Phase 1 Permissions Matrix

Last updated: 2026-04-05

## Purpose

Document the exact permission set requested by the reviewer deployment and map each permission to the active code path that uses it.

## Active Scope Profile

- `META_OAUTH_SCOPE_PROFILE=review_phase_1`
- Source of truth: `utils/meta-oauth.ts`

## Requested Permissions

| Permission | Active reason in reviewer deployment | Primary code paths |
|---|---|---|
| `public_profile` | Required for the Meta OAuth login flow and token inspection | `utils/meta-oauth.ts`, `app/api/auth/meta/callback/route.ts` |
| `pages_show_list` | Required to list Pages the user can select for the workspace | `app/api/auth/meta/callback/route.ts` |
| `pages_read_engagement` | Required dependency for the submitted Facebook Page publishing flow and stored capability metadata | `utils/meta-oauth.ts`, `app/api/auth/meta/callback/route.ts`, `lib/meta-account.ts` |
| `pages_manage_posts` | Required to publish Facebook posts immediately and on schedule | `utils/meta-publish.ts`, `supabase/functions/process-scheduled-posts/index.ts` |
| `instagram_basic` | Required to discover the Instagram Business account linked to the selected Page | `app/api/auth/meta/callback/route.ts`, `app/api/auth/meta/select-page/route.ts` |
| `instagram_content_publish` | Required to publish Instagram media immediately and on schedule | `utils/meta-publish.ts`, `supabase/functions/process-scheduled-posts/index.ts` |

## Explicitly Excluded from Reviewer Deployment

The reviewer deployment does not expose code paths for:

- `instagram_manage_insights`
- `instagram_manage_comments`
- `instagram_manage_messages`
- `pages_messaging`

Those capabilities remain out of scope for the Phase 1 Meta submission.
