# Meta Review Screencast Script — Phase 1

Last updated: 2026-04-03

Target duration: `2:00` to `2:30`

## Opening

Swift Digital Sol Social is a business social media publishing platform. This review video covers the Phase 1 Meta submission flow: connecting a Facebook Page and linked Instagram Business account, publishing content, and scheduling content.

## Connect Flow

I open `Settings -> Brand Profile -> Connected Accounts` and click `Connect Facebook Pages`.

The app redirects to the canonical Meta OAuth flow. In this reviewer release, the requested permissions are limited to:

- `public_profile`
- `pages_show_list`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

After authorization, the app returns to the page-selection step. I select one Facebook Page. If that Page has a linked Instagram Business account, it is connected in the same flow.

## Publish Now

I click `Create Post`, choose Facebook and Instagram, enter content, optionally attach media, and click `Post Now`.

For Facebook, the app uses `pages_manage_posts` to publish to the selected Page. For Instagram, the app uses `instagram_content_publish` to create a media container and publish it.

## Schedule

I create another post, choose `Schedule`, and select a future date and time.

The scheduled post appears in the scheduler. When the scheduled time arrives, the server-side publishing worker publishes it using the same connected business assets and the same permissions already granted by the user.

## Closing

This Phase 1 reviewer deployment is intentionally limited to business asset connection and user-initiated publishing. Messaging, comments, analytics, automation, and subscription surfaces are excluded from this submission.
