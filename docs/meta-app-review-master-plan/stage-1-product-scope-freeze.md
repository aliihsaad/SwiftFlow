# Stage 1: Product Scope Freeze

Status: `done`

Depends on: `Stage 0`

## Goal

Freeze the product definition for the first Meta submission so implementation cannot drift.

## Required Decisions

1. Submit Phase 1 only
2. Exclude DMs from first submission
3. Exclude advanced analytics from first submission
4. Exclude comments from first submission unless a dedicated stabilization pass is approved
5. Use `OpenRouter-first, BYOK-first` for the AI direction
6. Do not present billing as live until backend enforcement exists

## Included Reviewer Features

- Connect Facebook Page
- Detect linked Instagram Business account
- Create post
- Publish now
- Schedule post
- View published status

## Requested Permissions

- `public_profile`
- `pages_show_list`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

## Excluded Reviewer Features

- Messages
- Comments moderation
- Advanced analytics
- Webhook-triggered automations
- DM automations
- Subscription and billing claims

## Exit Gate

- Phase 1 permission set approved
- Excluded reviewer features explicitly listed
- OpenRouter-first AI direction approved
- Billing truth reset approved

## Locked Output

Later stages must preserve this reviewer scope unless a formal rollback is approved.
