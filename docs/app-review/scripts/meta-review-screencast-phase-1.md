# Meta Review Screencast Script — Phase 1 Resubmission

Last updated: 2026-04-10

Target duration: `3:00` to `4:30`

Recording requirements from Meta rejection:

- Show the complete Meta login flow
- Show the user granting app access to the requested permissions
- Show the full end-to-end use case after permission grant
- Record the app in English
- Add spoken explanation or visible captions/tooltips for each major step

## Permissions In Scope

This resubmission screencast must clearly support these permissions only:

- `public_profile`
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

## Recording Rules

- Record in one continuous take if possible
- Use the review deployment only
- Use English UI text in the app and in the browser where possible
- Zoom enough so Meta reviewers can read the permission dialog and button labels
- Speak slowly or add captions that name the permission/use-case connection
- Do not cut away during Meta OAuth or page-selection
- Do not show hidden Phase 2+ features

## Shot-by-Shot Script

### 1. Opening Context

Start on the public landing page.

Say:

`This is Swift Digital Sol Social. This review video demonstrates the Phase 1 Meta use case only: connecting a Facebook Page and linked Instagram Business account, then publishing immediately or scheduling a post.`

Show:

- public landing page
- footer links:
  - Privacy Policy
  - Terms of Service
  - Data Deletion

### 2. Sign In

Click `Sign In` or `Open Dashboard`.

Say:

`I am signing into the review deployment to access the business publishing workflow.`

Show:

- login screen
- successful sign-in
- dashboard loading
- `Review Mode` indicator if visible

### 3. Navigate To Connection Flow

Go to:

- `Settings`
- `Brand Profile`
- `Connected Accounts`

Say:

`I am opening the connected account settings where the user starts the Meta connection flow.`

### 4. Start Meta OAuth

Click the Meta/Facebook connect button.

Important:

- do not skip or cut this part
- keep the full browser redirect visible

Say:

`The app now redirects to the Meta login and authorization flow.`

### 5. Show Complete Meta Login And Permission Grant

This is the most important missing part from the rejected submission.

Show clearly:

- Meta login screen if it appears
- account selection if it appears
- authorization dialog
- permission grant / continue button

While on the Meta permission screens, say:

`This flow grants the app access needed for the submitted Phase 1 use case.`

Then explicitly name what the reviewer should connect to what they see:

- `pages_show_list` lets the user view and choose the Facebook Page they manage
- `pages_read_engagement` lets the app read the limited Page information needed for the connected Page publishing flow
- `pages_manage_posts` lets the app publish approved content to the selected Facebook Page
- `instagram_basic` lets the app identify the linked Instagram Business account
- `instagram_content_publish` lets the app publish approved content to that Instagram Business account

If the Meta dialog does not list permissions line-by-line in a readable way, still narrate them while the authorization screen is visible.

### 6. Return To App And Select Page

After Meta authorization, let the app redirect back naturally.

Show:

- the return to the app
- page/account selection UI
- selecting the Facebook Page
- linked Instagram Business account appearing as part of the same business connection

Say:

`Back in the app, the user can view the Pages they manage, choose the correct Page, and connect the linked Instagram Business account. This is the end-to-end use of pages_show_list and instagram_basic within the connection flow.`

### 7. Confirm Connected Assets

Pause briefly on the connected account state.

Show:

- connected Facebook Page
- connected Instagram Business account

Say:

`The business assets are now connected and ready for publishing.`

### 8. Publish Now Flow

Go to `Create Post`.

Create a real post for both channels if the UI supports selecting both.

Show:

- entering the post caption
- selecting Facebook and Instagram destinations
- adding media if required for Instagram
- clicking `Post Now`

Say:

`Now I am creating a post and publishing it immediately. The app uses pages_manage_posts to publish to the Facebook Page and instagram_content_publish to publish to the linked Instagram Business account.`

Then show the result:

- success state in app
- if available, published/success confirmation
- if available, any published post record in the dashboard/scheduled history

### 9. Schedule Flow

Create a second post.

Show:

- choosing `Schedule`
- selecting a future date/time
- saving the scheduled post
- the post appearing in the scheduled list

Say:

`This demonstrates the same connected-asset publishing workflow using a scheduled publish instead of immediate publish.`

Important:

- if possible, show a scheduled item visible in the scheduler list after save
- if practical, use a near-future time and capture the later success as an extra supporting clip, but the required screencast should at minimum show the schedule creation end-to-end

### 10. Closing

End back on the dashboard or scheduled page.

Say:

`This Phase 1 review build is intentionally limited to Page and Instagram Business account connection, immediate publishing, and scheduled publishing. Messaging, comments, analytics, automation, and subscription features are intentionally excluded from this submission.`

## Recommended On-Screen Captions

Use short captions during the video like:

- `Step 1: Open review deployment`
- `Step 2: Sign in`
- `Step 3: Start Meta connection`
- `Step 4: Grant requested permissions`
- `Step 5: Select Facebook Page and linked Instagram Business account`
- `Step 6: Publish now`
- `Step 7: Schedule post`

## What Not To Do In The New Video

- Do not skip the Meta login/authorization screens
- Do not assume the reviewer understands the permission-to-feature mapping without narration
- Do not record in Arabic or mixed UI if English is available
- Do not focus on AI, automation, comments, analytics, or other out-of-scope areas
- Do not cut directly from the app to an already-connected state

## Final Pre-Recording Checklist

- Confirm the app language is English
- Confirm the browser language is English if possible
- Confirm the test Page and linked Instagram Business account are working
- Confirm `Post Now` works
- Confirm scheduling works
- Confirm the review deployment URL is the one shown in the submission
- Confirm the permission set in the app matches the resubmission scope
