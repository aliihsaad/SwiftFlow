# Review Environment Checklist

Last updated: 2026-04-03

## Purpose

Track the environment configuration required for the Meta review deployment.

## Required Variables

- `NEXT_PUBLIC_META_APP_ID`
- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `APP_SECRETS_ENCRYPTION_KEY`
- `APP_RELEASE_CHANNEL=review_phase_1`
- `META_OAUTH_SCOPE_PROFILE=review_phase_1`

## Required Review-Mode Settings

- Reviewer deployment must use `APP_RELEASE_CHANNEL=review_phase_1`
- Reviewer deployment must use `META_OAUTH_SCOPE_PROFILE=review_phase_1`
- Full/internal deployment should use `APP_RELEASE_CHANNEL=production_full`
- Full/internal deployment should use `META_OAUTH_SCOPE_PROFILE=full`
- Meta OAuth redirect URI must point to:
  - `/api/auth/meta/callback`
- Legacy `/api/auth/social/*` flow must remain disabled

## Verification

- Review deployment hides messages, comments, posts, analytics, automation, and subscription surfaces
- Review deployment redirects blocked dashboard routes back to `/dashboard`
- Review deployment acknowledges Meta webhook deliveries but does not execute webhook-driven side effects for messages, comments, or automations
- Connect flow uses `/api/auth/meta/login`
- Callback uses `/api/auth/meta/callback`
- OAuth dialog requests only: `public_profile`, `pages_show_list`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`
