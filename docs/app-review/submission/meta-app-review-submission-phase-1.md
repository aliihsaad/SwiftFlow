# Meta App Review Submission — Phase 1

Last updated: 2026-04-03

## App Summary

Swift Digital Sol Social is a social media management platform for businesses. In the Phase 1 Meta review release, users can connect one Facebook Page and its linked Instagram Business account to a workspace, create posts, publish immediately, and schedule publishing for a later time. All publishing actions are user-initiated. AI features are limited to content drafting and do not publish or interact with Meta APIs autonomously.

## Review Scope

This submission is intentionally limited to the review-safe Phase 1 release. The reviewer deployment does not expose messaging, comment management, analytics, automation, or subscription surfaces.

When the reviewer opens the dashboard, the deployment also shows a visible `Review Mode` indicator and a short Phase 1 explanation card describing the allowed flow: connect account, create post, publish or schedule.

## Declared Use Cases

### Use Case 1: Connect a Facebook Page and linked Instagram Business account

The user opens Brand Profile, clicks `Connect Facebook Pages`, completes Meta OAuth, and selects a Page. If that Page has a linked Instagram Business account, the app connects it in the same flow.

### Use Case 2: Publish content to Facebook Pages and Instagram Business accounts

The user creates a post with text and optional media, chooses the connected platforms, and clicks `Post Now`. The app publishes to Facebook with the selected Page token and to Instagram using the media container plus publish flow.

### Use Case 3: Schedule publishing for a future date and time

The user creates a post, chooses `Schedule`, and selects a future date/time. A server-side scheduled function later publishes the post to the selected connected platforms using the same publish endpoints.

## Permissions Requested

| Permission | Why it is required in Phase 1 | Where it is used |
|---|---|---|
| `public_profile` | Required for Meta OAuth sign-in and token inspection during the connection flow. | `utils/meta-oauth.ts`, `app/api/auth/meta/callback/route.ts` |
| `pages_show_list` | Required to list the Facebook Pages the user administers so the user can choose which Page to connect to the workspace. | `app/api/auth/meta/callback/route.ts` |
| `pages_manage_posts` | Required to publish text or photo posts to the selected Facebook Page immediately or on schedule. | `utils/meta-publish.ts`, `supabase/functions/process-scheduled-posts/index.ts` |
| `instagram_basic` | Required to detect the Instagram Business account linked to the selected Facebook Page and store that connected business asset. | `app/api/auth/meta/callback/route.ts`, `app/api/auth/meta/select-page/route.ts` |
| `instagram_content_publish` | Required to create and publish Instagram media for user-authored posts immediately or on schedule. | `utils/meta-publish.ts`, `supabase/functions/process-scheduled-posts/index.ts` |

Total requested permissions in this Phase 1 submission: `5`

## OAuth and Connection Flow

1. The user starts the canonical Meta flow at `/api/auth/meta/login`.
2. The app redirects to the Meta OAuth dialog using the shared Graph version policy defined in `lib/meta-graph-version.ts`.
3. The callback at `/api/auth/meta/callback` exchanges the code for a user token, inspects granted scopes with `debug_token`, and fetches the Pages available to that user from `/me/accounts`.
4. The app checks each returned Page for a linked Instagram Business account.
5. The user chooses one Page in the page-selection step.
6. The app stores only the selected Facebook Page and its linked Instagram Business account for that workspace in `social_accounts`.

Legacy `/api/auth/social/*` routes are disabled and are not part of the active review flow.

## Data Handling and Storage

### Data stored from Meta in this Phase 1 release

| Data category | Purpose |
|---|---|
| Facebook Page ID and Page name | Identify the selected connected Page |
| Instagram Business account ID and username | Identify the linked connected Instagram business account |
| Page access token | Authenticate publish requests server-side |
| Granted scopes and granular scopes | Record the permissions actually granted to the workspace connection |
| Token expiry timestamp | Track when the user should reconnect |
| Published post IDs and permalinks | Associate local posts with their Meta-side published records |

### Primary storage tables

| Table | Purpose |
|---|---|
| `social_accounts` | Connected Page and Instagram business account records plus tokens and granted scope metadata |
| `posts` | User-authored post content, status, target platforms, and schedule time |
| `published_posts` | Mapping between local posts and published Meta post records |
| `oauth_page_sessions` | Short-lived selection session used during the connect flow |

### Data use confirmation

- Meta data is used only to connect business assets chosen by the user and publish user-authored content.
- Meta data is not sold, shared with advertisers, or used for unrelated profiling.
- Tokens are used only in server-side routes and server-side functions.

## Reviewer Test Instructions

### Prerequisites

- A Facebook Page administered by the reviewer test account
- An Instagram Business account linked to that Facebook Page

### Steps

1. Sign in to the reviewer deployment.
2. Open `Settings -> Brand Profile -> Connected Accounts`.
3. Click `Connect Facebook Pages`.
4. Complete the Meta OAuth dialog and approve the requested permissions.
5. On return, select one Facebook Page from the page-selection step.
6. Confirm the workspace now shows the connected Facebook Page and linked Instagram account.
7. Click `Create Post`.
8. Choose Facebook and/or Instagram, enter text, and optionally add media.
9. Click `Post Now` and confirm the post succeeds.
10. Create another post, choose `Schedule`, and set a future date/time.
11. Confirm the scheduled post appears in the scheduler/calendar view and later publishes successfully.

## Public Compliance URLs

- Privacy Policy: `/privacy`
- Terms of Service: `/terms`
- Data Deletion Instructions: `/data-deletion`

These pages describe the actual stored data categories, encrypted token handling, AI/session storage, and the deletion request path used by the current product.

## What the Reviewer Will Not See in Phase 1

The review deployment intentionally hides and blocks:

- messages
- comments
- analytics
- automation
- subscription

These surfaces are reserved for later release stages and are not part of this submission.

## Compliance Notes

- The platform acts only on Facebook Pages and Instagram Business assets explicitly authorized by the user.
- Publishing is always initiated by the user, either immediately or by user-created schedule.
- AI features are draft assistance only. They do not autonomously publish or call Meta APIs on their own.
- There is no legacy OAuth path in the active reviewer deployment.

## Environment Notes

The reviewer deployment must use:

```env
APP_RELEASE_CHANNEL=review_phase_1
META_OAUTH_SCOPE_PROFILE=review_phase_1
```

This ensures the reviewer deployment matches the declared scope and requested permissions.
