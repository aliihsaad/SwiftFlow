# Review Publish Verification Checklist

Use this after deploying the Stage 7 release candidate to the review environment.

## Environment

- Confirm `APP_RELEASE_CHANNEL=review_phase_1`
- Confirm `META_OAUTH_SCOPE_PROFILE=review_phase_1`
- Confirm `NEXT_PUBLIC_APP_URL` points at the reviewer deployment
- Confirm `APP_SECRETS_ENCRYPTION_KEY` is present
- Confirm the Stage 7 migration for post publish failure fields has been applied
- Confirm `process-scheduled-posts` is deployed after the migration

## Publish Now

1. Connect a Facebook Page and linked Instagram Business account from Brand Settings.
2. Confirm Dashboard shows:
   - Facebook Page: `Connected`
   - Instagram Business: `Connected`
   - Publish Readiness: `Ready`
3. Create a post with supported media.
4. Choose `Publish now`.
5. Verify the post transitions out of `scheduled` and into:
   - `published` on success, or
   - `failed` with a readable explanation on failure.

## Scheduled Publish

1. Create a second post.
2. Schedule it 5-10 minutes ahead.
3. Verify it appears in the Scheduled tab and calendar.
4. Wait for the scheduler to run.
5. Verify the post transitions into:
   - `published` on success, or
   - `failed` with platform-specific details in the Failed tab.

## Failure-State Check

Trigger at least one known failure condition in a non-production test account if safe.

Examples:

- revoke publishing permission and reconnect incompletely
- disconnect the target account
- use invalid/expired Meta credentials in a safe test setup

Verify:

- the Dashboard warning links to the Failed tab
- the Failed tab shows a readable failure summary
- the failed post card shows which platform failed
- successful platforms are called out when only part of a multi-platform publish failed

## Review Safety

- Confirm messages, comments, analytics, automation, and subscription remain hidden in review mode
- Confirm webhook deliveries do not trigger reviewer-visible side effects in `review_phase_1`
- Confirm the reviewer screencast only demonstrates connect + publish + schedule flows
