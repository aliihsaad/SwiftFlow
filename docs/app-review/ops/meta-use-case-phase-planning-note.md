# Meta Use Case Phase Planning Note

Last updated: 2026-04-03

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

## Working Decision

For the current Meta App Review round, submit only the 5 Phase 1 permissions and align:

- Meta App Review requested permissions
- OAuth dialog scopes in the review deployment
- reviewer instructions
- screencast
- reviewer-visible UI

All of those should remain in sync until Phase 1 approval is complete.
