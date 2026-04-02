# Stage 7: Reliability Hardening

Status: `not_started`

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
