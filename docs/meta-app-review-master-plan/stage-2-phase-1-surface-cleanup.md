# Stage 2: Phase 1 Surface Cleanup

Status: `done`

Depends on: `Stage 1`

## Goal

Remove or hide product surfaces that would confuse reviewers or expose unsupported behavior.

## Required Work

1. Remove or hard-disable legacy reviewer-visible entry points
2. Hide unsupported routes for the review release:
   - `/dashboard/messages`
   - `/dashboard/comments`
   - `/dashboard/analytics`
   - `/dashboard/automation`
   - `/dashboard/subscription`
3. Add route guards server-side, not just UI hiding
4. Remove false billing and credit claims from pricing and subscription surfaces
5. Simplify navigation so the reviewer path only exposes supported actions

## Progress

- Added shared release-channel gating utility
- Added middleware redirect for blocked dashboard routes in review mode
- Hid blocked routes from desktop and mobile navigation
- Hid blocked dashboard quick actions
- Replaced fake billing/subscription UI with roadmap-only copy
- Hard-disabled the legacy reviewer-visible Meta OAuth path

## Primary Files

- `components/layout/sidebar.tsx`
- `app/dashboard/layout.tsx`
- `app/dashboard/*`
- `app/pricing/page.tsx`
- `components/settings/subscription-view.tsx`

## Exit Gate

- Legacy routes not reachable from product flow
- Unsupported reviewer surfaces hidden or blocked
- Pricing/subscription UI no longer makes false operational claims

## Locked Output

Later stages must not reintroduce blocked reviewer-path features before the approved expansion stage.
