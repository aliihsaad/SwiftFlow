# Meta Use Case Phase Planning Note

Last updated: 2026-04-29

## Purpose

Keep a clear record of how the Meta dashboard use cases relate to the current Phase 1 submission versus later review rounds.

## Important Rule

Meta dashboard use cases can exist in the app configuration, but the permissions submitted for App Review should match the functionality actually exposed and demonstrated in the current reviewer deployment.

For the current Phase 1 submission, the reviewer deployment is intentionally limited to:

- connecting one Facebook Page and its linked Instagram Business account
- publishing immediately
- scheduling publishing

The reviewer deployment does not expose messaging, comments, analytics, automation, or subscription surfaces.

During `review_phase_1`, webhook verification can remain configured in Meta, but the reviewer deployment should not execute webhook-driven side effects for messages, comments, or automation flows.

## Phase 1 Permissions To Keep

- `public_profile`
- `pages_show_list`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

## Use Case Mapping

### Manage messaging & content on Instagram

Keep for Phase 1:

- `instagram_basic`
- `instagram_content_publish`

Remove from Phase 1:

- `instagram_manage_comments`
- `instagram_manage_insights`
- `instagram_manage_messages`
- `instagram_business_manage_messages`
- `instagram_business_basic`
- `pages_read_engagement`
- `business_management`

### Manage everything on your Page

Keep for Phase 1:

- `pages_show_list`
- `pages_manage_posts`

Remove from Phase 1:

- `pages_read_engagement`
- `pages_manage_engagement`
- `pages_manage_metadata`
- `pages_read_user_content`
- `read_insights`
- `business_management`

### Engage with customers on Messenger from Meta

Keep for Phase 1:

- nothing

Remove from Phase 1:

- `pages_messaging`
- `instagram_manage_messages`
- `pages_manage_metadata`
- `pages_read_engagement`
- `business_management`

## Later Review Rounds

The following capabilities should be submitted only after the related product surfaces are re-enabled, stabilized, and fully documented for reviewers:

- Instagram comments management
- Instagram and Facebook messaging
- Facebook and Instagram analytics / insights
- Messenger-related features

## Phase 2 Before New Permission Review

Phase 2 should begin before preparing the next Meta permission review package.

The first Phase 2 work should use already-approved permissions:

- stabilize approved publishing, scheduling, reconnect, and permission-state behavior
- improve Facebook Page content and analytics value from `pages_read_engagement`
- add AI content-generation automation that creates drafts, schedules posts, or auto-publishes only when explicitly enabled by the workspace

Automation must be split into two categories:

- Publishing automation: allowed to launch under the existing publishing permissions when it only generates, schedules, or publishes content for connected accounts.
- Engagement automation: must stay hidden until comments/messages permissions are approved, because it reacts to or sends comments, DMs, private replies, or message responses.

Do not start the next permission review package until the target surface has:

- deterministic capability checks
- stable reconnect/missing-scope recovery
- reviewer-visible UI that matches the requested permission
- audit logs or operational evidence for any automated action
- a clean screencast path with no placeholder or gated dead-end surfaces

## Working Decision

For the current Meta App Review round, submit only the 5 Phase 1 permissions and align:

- Meta App Review requested permissions
- OAuth dialog scopes in the review deployment
- reviewer instructions
- screencast
- reviewer-visible UI

All of those should remain in sync until Phase 1 approval is complete.
