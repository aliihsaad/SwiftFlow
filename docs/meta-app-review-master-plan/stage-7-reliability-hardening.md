# Stage 7: Reliability Hardening

Status: `in_progress`

Depends on: `Stage 4`, `Stage 5`, `Stage 6`

## Goal

Turn the review-safe release into a stable release candidate.

## Required Work

1. Normalize publish and schedule failure states
2. Verify publishing on the production review environment
3. Verify scheduled publishing on the production review environment
4. Add integration health/status UI
5. Add deploy-time checks for required env and secrets
6. Confirm no reviewer flow depends on unstable webhook or automation behavior

## Key Outcomes

- understandable errors
- deterministic release candidate
- environment validation before deploy

## Exit Gate

- Publish now works on production review environment
- Scheduled publishing works on production review environment
- Failure states are normalized and understandable
- Deploy-time checks catch missing env/secrets

## Locked Output

Stage 8 must package this exact release candidate, not continue changing core behavior.

## Progress Notes

- build-time environment validation is being added for `review_phase_1`
- reviewer-facing integration health/status UI is being added so publish readiness is visible before testing
- failed posts now persist normalized publish attempt metadata instead of collapsing to a bare `failed` status
- scheduled/failed post UI is being updated to show readable platform-specific failure summaries
- a production review verification checklist now lives in `docs/app-review/ops/review-publish-verification-checklist.md`
- the Stage 7 post-failure migration has been applied to Supabase and `process-scheduled-posts` has been redeployed
- `process-scheduled-posts` must be deployed with `--no-verify-jwt` because it is triggered internally by the app server and scheduler paths
- live publish-now and scheduled-publish verification on the production review environment is still pending before this stage can close
