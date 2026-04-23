# Approved Meta Permissions Opportunity Map

Last updated: 2026-04-22

## Goal

Document what the already-approved Meta permissions can legally and practically unlock next, without requesting new permissions.

## Source Of Truth

Official Meta permission reference:

- https://developers.facebook.com/docs/facebook-login/permissions

Key approved permissions in the current app review result:

- `public_profile`
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

## Summary

The most underused approved permission is `pages_read_engagement`.

Based on Meta's permission reference, it does more than support basic Page connection:

- read Page content
- read Page metadata
- read follower-related data including names, PSIDs, and profile pictures
- read Page insights-related metadata

That makes it the best candidate for the first post-approval expansion work, especially for Facebook analytics, existing-post libraries, and richer account health views.

## Permission-By-Permission Map

### `public_profile`

Official allowed usage:

- authenticate app users
- provide a personalized in-app experience

Current practical usage in the repo:

- user auth and workspace access flow

Additional product value still available:

- better account welcome/profile personalization
- show the authenticating Meta user's identity in connection flows
- stronger audit/history labels for who connected or refreshed a workspace account

Priority:

- Low. Useful UX polish, not a major feature unlock.

### `pages_show_list`

Official allowed usage:

- show a person the list of Pages they manage
- verify that a person manages a Page

Current practical usage in the repo:

- Page selection during Meta connection

Additional product value still available:

- multi-Page selection and switching UX
- reconnect flow that lets users replace the currently linked Page without disconnecting everything
- admin verification/status screens before running publish, analytics, or automation setup

Priority:

- Medium. Good account-management UX improvement, but not the biggest business unlock.

### `pages_read_engagement`

Official allowed usage:

- get content posted by your Page
- get names, PSIDs, and profile pictures of your Page followers
- get metadata about your Page

Current practical usage in the repo:

- analytics capability checks
- Facebook post/account analytics sync
- some content reads and Page metadata fetches

High-value additional product value still available:

- richer Facebook analytics dashboards using Page metadata and existing content
- a Facebook post library that includes native Page posts, not only posts created inside SwiftFlow
- top-performing-post and recent-post views for Facebook
- Page health cards with follower counts, profile metadata, and publishing status
- contact/profile enrichment for Page-linked follower or conversation identity where that is already allowed by the current flow

Guardrails:

- This permission does **not** replace dedicated comment-management or messaging permissions.
- Avoid building a follower-directory feature unless the use case is tightly justified and necessary.

Priority:

- Highest.

### `pages_manage_posts`

Official allowed usage:

- publish a post, photo, or video to your Page
- update a post, photo, or video on your Page
- delete a post, photo, or video on your Page

Current practical usage in the repo:

- create/publish Facebook posts
- scheduled publishing

Additional product value still available:

- edit published Facebook posts from inside SwiftFlow
- delete published Facebook posts from inside SwiftFlow
- add safer retry-and-edit flows after publish failures
- build a post operations panel for app-created and discovered Page posts

Guardrails:

- Any edit/delete UI should be explicit and auditable.
- This is a strong operational feature, but not a permission expansion.

Priority:

- High.

### `instagram_basic`

Official allowed usage:

- get basic metadata of an Instagram Business account profile, for example username and ID
- read an Instagram account profile's info and media

Current practical usage in the repo:

- linked account discovery
- Instagram account metadata during connection and publishing flows

Additional product value still available:

- import/display an existing Instagram media library owned by the connected business account
- improve Instagram account health/profile cards
- use owned-account media reads for better post history and source-of-truth reconciliation
- strengthen media pickers and preview workflows with account-native content context

Guardrails:

- Keep this focused on the connected account's own profile/media use cases.
- Do not treat it like a substitute for comments, DMs, or insights permissions.

Priority:

- Medium to High.

### `instagram_content_publish`

Official allowed usage:

- manage the organic content creation process for Instagram
- create organic feed photo and video posts on behalf of a business

Current practical usage in the repo:

- immediate Instagram publishing
- scheduled Instagram publishing

Additional product value still available:

- stronger publish queue UX for Instagram
- better preflight validation before publish
- post retry flows with cleaner error handling
- richer publish-state history for Instagram content operations

What this is **not**:

- It is not an analytics permission.
- It is not a messaging permission.
- It is not a comments permission.

Priority:

- Medium. It improves the publishing product depth, but it is not the largest unused surface.

## Best Next Moves Without New Permissions

### 1. Expand Facebook analytics and content library using `pages_read_engagement`

This is the best immediate payoff because the permission is already approved and partially wired in code.

### 2. Add edit/delete lifecycle controls for Facebook posts using `pages_manage_posts`

This creates a clearer operations story and makes SwiftFlow more than a one-way publisher.

### 3. Improve account-management UX using `pages_show_list` + `instagram_basic`

This is a lower-risk way to strengthen setup, reconnect, and workspace account switching.

## Capabilities That Still Need New Permissions

These should not be treated as unlocked by the current approval:

- Instagram insights beyond what is available from currently approved scopes: needs `instagram_manage_insights`
- Instagram comment moderation: needs `instagram_manage_comments`
- Instagram DM inbox/replies: needs `instagram_manage_messages`
- Facebook Messenger inbox/replies: needs `pages_messaging`
- Facebook Page comment management by users/other Pages: may require additional comment/user-content permissions depending on the exact workflow

## Product Recommendation

If the goal is to maximize value from the approved set before another review cycle:

1. Push harder on Facebook analytics and existing-content intelligence with `pages_read_engagement`.
2. Add Facebook post edit/delete controls with `pages_manage_posts`.
3. Improve account-switching and account health surfaces with `pages_show_list` and `instagram_basic`.
4. Treat Instagram publishing improvements as workflow depth, not a major new permission unlock.
