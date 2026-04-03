# Stage 6: Reviewer-Safe UX and Compliance

Status: `done`

Depends on: `Stage 3`, `Stage 4`

## Goal

Align the visible product, legal pages, and reviewer docs with the actual implementation.

## Required Work

1. Add capability-aware navigation and route behavior
2. Build a clean reviewer landing path:
   - connect account
   - select page
   - create post
   - publish
3. Rewrite public pages:
   - `/privacy`
   - `/data-deletion`
   - possibly `/terms`
4. Update reviewer docs to match actual route names and flows
5. Add integration health/status messaging where helpful

## Compliance Coverage Must Include

- page/profile identifiers
- post content and media
- comments if enabled
- messages if enabled
- analytics if enabled
- webhook event records
- automation logs
- AI prompts, sessions, and generated assets
- token storage and retention approach

## Exit Gate

- Reviewer-safe navigation and route guards active
- Privacy and data deletion pages reflect actual behavior
- Submission docs match the real UI and route names

## Locked Output

Later stages must not create reviewer-visible functionality that the compliance pages and docs do not describe.

## Progress Notes

- public compliance pages now describe actual storage, retention, AI usage, and Meta-connected data behavior
- reviewer mode is now surfaced directly inside the dashboard so the review deployment explains its narrowed scope
- reviewer-facing submission and screencast docs now match the current Phase 1 UI and route flow
