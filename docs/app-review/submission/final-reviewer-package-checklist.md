# Final Reviewer Package Checklist

Last updated: 2026-04-03

Use this checklist immediately before submitting the Phase 1 Meta App Review package.

## Submission Scope

- Confirm the submission is limited to Phase 1
- Confirm the requested permissions are only:
  - `public_profile`
  - `pages_show_list`
  - `pages_manage_posts`
  - `instagram_basic`
  - `instagram_content_publish`
- Confirm no messaging, comments, analytics, automation, or subscription features are described in the submission answers

## Reviewer Deployment

- Confirm the review deployment URL is final
- Confirm `APP_RELEASE_CHANNEL=review_phase_1`
- Confirm `META_OAUTH_SCOPE_PROFILE=review_phase_1`
- Confirm `NEXT_PUBLIC_APP_URL` matches the submitted review deployment URL
- Confirm the review deployment is healthy after the latest Vercel deploy

## Product Verification

- Confirm Facebook Page connection works
- Confirm linked Instagram Business account connection works
- Confirm `Post Now` works
- Confirm scheduled publishing works
- Confirm blocked reviewer surfaces stay hidden and blocked
- Confirm the dashboard shows the review-mode banner and guidance
- Confirm the public landing page is the review-safe variant

## Reviewer Package Files

- Confirm [meta-app-review-submission-phase-1.md](/C:/Users/Mini/Desktop/Projects/Social-Media-Manager-AI-Tool/docs/app-review/submission/meta-app-review-submission-phase-1.md) is the final submission copy
- Confirm [meta-review-screencast-phase-1.md](/C:/Users/Mini/Desktop/Projects/Social-Media-Manager-AI-Tool/docs/app-review/scripts/meta-review-screencast-phase-1.md) matches the real flow
- Confirm [review-phase-1-permissions-matrix.md](/C:/Users/Mini/Desktop/Projects/Social-Media-Manager-AI-Tool/docs/app-review/evidence/review-phase-1-permissions-matrix.md) matches the exact requested permissions
- Confirm [review-env-checklist.md](/C:/Users/Mini/Desktop/Projects/Social-Media-Manager-AI-Tool/docs/app-review/ops/review-env-checklist.md) matches the active deployment
- Confirm [reviewer-access-handoff-template.md](/C:/Users/Mini/Desktop/Projects/Social-Media-Manager-AI-Tool/docs/app-review/ops/reviewer-access-handoff-template.md) has been filled in if reviewer credentials or special access instructions are required

## Recorded Assets

- Record the final screencast using the approved Phase 1 flow only
- Store the final screencast file reference in `docs/app-review/scripts/`
- Store any submission screenshots in `docs/app-review/evidence/`
- Update the asset index after recording

## Final Sanity Check

- Confirm the reviewer can complete the flow without needing hidden features
- Confirm all documents describe the same 3 actions:
  - connect account
  - create post
  - publish now or schedule
- Confirm any placeholders have been replaced before submission
