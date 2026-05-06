# Phase 2 Meta Permission Audit Plan

Last updated: 2026-05-06

## Goal

Prepare the next Meta permission stage without mixing unrelated product surfaces in one review. The app should request only the permissions needed by visible, stable, reviewer-demonstrable features.

## Current Baseline

The Phase 1/review profile is intentionally narrow and currently defaults from `utils/meta-oauth.ts`:

- `public_profile`
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

The Phase 1 release gate hides:

- `/dashboard/analytics`
- `/dashboard/comments`
- `/dashboard/posts`
- `/dashboard/messages`
- `/dashboard/automation`
- `/dashboard/subscription`

Webhooks are configured at `/api/webhooks/instagram`, but `review_phase_1` acknowledges events without processing comment/message/automation side effects.

## Page-by-Page Permission Matrix

| Page / surface | Current Meta usage | Required permissions | Review stage |
| --- | --- | --- | --- |
| Dashboard `/dashboard` | Reads local post/account state and checks publish capability from stored token metadata. | No new permissions beyond current connect/publish scopes. | Keep live. |
| Create Post button / compose modal | Publishes or schedules Facebook Page and Instagram professional-account content. | Facebook: `pages_manage_posts`; Instagram: `instagram_content_publish`; account connection uses `pages_show_list`, `instagram_basic`. | Already Phase 1-approved surface. |
| Scheduled `/dashboard/scheduled` | Reads local drafts/scheduled/published/failed posts. Scheduled publishing runner posts via Meta when due. | Same as publishing: `pages_manage_posts`, `instagram_content_publish`. | Already Phase 1-approved surface. |
| AI Assistant `/dashboard/assistant` | Generates ideas/captions/images through app AI routes; does not call Meta directly. | No Meta permission needed unless user later publishes generated content. | Keep live. |
| Brand Profile `/dashboard/settings/brand` | Connects Meta accounts, lists Pages, stores selected Page and linked IG business account. | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish` for current profile. Later reconnect profile will expand by stage. | Keep live. |
| Settings `/dashboard/settings` | Workspace/team/app settings only. | No Meta permission needed. | Keep live. |
| Onboarding `/dashboard/onboarding` | Workspace setup; may lead to account connection. | Same as Brand Profile if it invokes Meta connect. | Keep live if it only exposes current connect profile. |
| Subscription `/dashboard/subscription` | Billing/entitlement surface. | No Meta permission needed. | Not part of Meta review; keep separate from permission package. |
| Analytics `/dashboard/analytics` | Calls `/api/sync-analytics` and `/api/analytics`; syncs account and post analytics. | Facebook: `pages_read_engagement`; Instagram: `instagram_manage_insights` plus `instagram_basic` for IG account/media context. | Best Phase 2A candidate. |
| Posts `/dashboard/posts` and redirect from `/dashboard/comments` | Lists IG media and FB Page posts; opens comments drawer; can edit/delete FB posts. | Read media: IG `instagram_basic`, FB `pages_read_engagement`. FB edit/delete: `pages_manage_posts`. Comments: IG `instagram_manage_comments`; FB read `pages_read_engagement`; FB manage currently requires `pages_manage_engagement` in code. | Split: media library can launch with current permissions; comments/moderation should wait for comments stage. |
| Messages `/dashboard/messages` | Lists conversations, reads message thread, sends replies through `/api/live-messages` and `/api/live-messages/send`. Webhook persists inbound messages and broadcasts realtime updates. | Facebook messages: `pages_messaging`. Instagram DMs: `instagram_manage_messages`; current implementation also uses the connected Page messaging endpoint, so Page messaging/webhook setup must be included in review evidence. | Phase 3, after comments/analytics. |
| Automation `/dashboard/automation` | Two different products live on one page: publishing automations and engagement/message automations. | Publishing automation: `pages_manage_posts`, `instagram_content_publish`. Comment triggers/replies: IG `instagram_manage_comments`; FB read `pages_read_engagement`; FB manage `pages_manage_engagement`. DM/private replies: `instagram_manage_messages`, `pages_messaging`. | Must split before review. Publishing automation can stay under current permissions; engagement automation waits for comments/messages stages. |

## Webhook / Realtime Trigger Audit

`app/api/webhooks/instagram/route.ts` handles:

- `comments`
- `feed` comment events for Facebook Page comments
- `messages`
- direct `entry.messaging[]`
- `mentions` currently logged/disabled
- `story_insights` story reply events

These events are not just notifications. They trigger:

- Supabase `webhook_events` idempotency
- local `conversations` / `messages` persistence
- Supabase Realtime message broadcasts
- `automation-orchestrator`
- `process-automations`

Conclusion: webhook-driven automations need to be treated as part of the permission review package for comments/messages, not as a passive backend detail.

## Scope Conflicts / Cleanup Required Before Review

1. `utils/meta-oauth.ts` blocks `pages_manage_engagement`, but `lib/meta-account.ts`, `/api/posts-media/comments`, and automation graph execution still require it for Facebook comment management.
2. `FULL_SCOPES` includes Instagram comments/insights/messages but does not include `pages_messaging` unless `META_OAUTH_INCLUDE_PAGES_MESSAGING=true`.
3. `/api/automations/media` reports missing Facebook media permission as `pages_manage_posts`, but the capability helper uses `pages_read_engagement` for Facebook connected-media reads.
4. The sidebar label "Posts" points to `/dashboard/comments`, which redirects to `/dashboard/posts`. This is harmless technically, but should be cleaned before reviewer screencasts.
5. Automation UI combines publishing automation with engagement/message automations. This will confuse reviewers unless the surfaces are split or strongly gated by stage.

## Recommended Review Stages

### Stage 2A: Analytics + Content Library

Request/use:

- Keep current scopes.
- Add/enable `instagram_manage_insights`.

Visible proof:

- Analytics page syncs Facebook and Instagram metrics.
- Posts page shows IG media and FB Page content library.
- Missing-permission reconnect state is deterministic.

Do not include:

- comment replies
- comment hiding/moderation
- DMs
- automated engagement triggers

### Stage 2B: Comments

Request/use:

- `instagram_manage_comments`
- Decide whether Facebook comment management is included. If yes, unblock/request `pages_manage_engagement`; if no, keep Facebook comments read-only under `pages_read_engagement`.

Visible proof:

- Posts page comments drawer.
- Read comments.
- Reply to IG comments.
- Hide/unhide comments only where permissions are approved.
- Audit trail / logs for comment actions.

Do not include:

- DMs/private replies.
- Message automations.

### Stage 3: Messaging + Engagement Automation

Request/use:

- `instagram_manage_messages`
- `pages_messaging`
- Webhook subscription evidence and any Page subscription requirements needed by the current Meta setup.

Visible proof:

- Messages inbox loads conversations.
- User sends a manual reply.
- Webhook delivers inbound message into the app.
- Automation can trigger from a new message only after manual messaging is proven stable.

### Stage 4: Full Engagement Automation

Request/use:

- Reuse approved comments/messages scopes.
- Only add additional scopes if a concrete new node requires them.

Visible proof:

- Comment -> reply automation.
- Comment -> private reply / DM automation.
- Message -> AI reply automation.
- Clear on/off controls, run logs, dedupe/idempotency evidence, and human-readable audit history.

## Immediate Next Steps

1. Decide Stage 2A vs 2B as the next submission target. Recommendation: Stage 2A first because analytics is already mostly built and lower risk.
2. Fix scope/profile consistency before changing Meta dashboard permissions.
3. Split Automation UI into "Publishing Automations" and "Engagement Automations" gates so publishing automation remains usable without comments/messages permissions.
4. Clean the permission mismatch around Facebook comment management (`pages_manage_engagement`) before exposing Facebook comment moderation.
5. Build a reviewer path and screencast script only after the selected stage is stable in production.

## Primary Code References

- `utils/meta-oauth.ts`
- `lib/meta-account.ts`
- `lib/release-channel.ts`
- `app/api/webhooks/instagram/route.ts`
- `app/api/posts-media/route.ts`
- `app/api/posts-media/comments/route.ts`
- `app/api/live-messages/route.ts`
- `app/api/live-messages/send/route.ts`
- `app/api/automations/route.ts`
- `supabase/functions/process-automations/index.ts`
- `supabase/functions/process-automations/graph-executor.ts`
- `supabase/functions/process-publishing-automations/index.ts`

## Meta Docs To Verify Against Before Submission

- Meta permissions reference: https://developers.facebook.com/docs/permissions/
- Facebook Pages posts API: https://developers.facebook.com/docs/pages-api/posts/
- Instagram content publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing/
- Instagram comment moderation: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/manage-comments/
- Instagram insights: https://developers.facebook.com/docs/instagram-platform/insights/
- Messenger API for Instagram: https://developers.facebook.com/docs/messenger-platform/instagram/
- Meta webhooks: https://developers.facebook.com/docs/graph-api/webhooks/
