# Progress Tracker

Status legend:

- `not_started`
- `in_progress`
- `blocked`
- `done`

## Stage Gate Tracker

| Stage | Status | Depends on | Locked output that later stages must preserve |
|---|---|---|---|
| Stage 0: Documentation foundation | `done` | none | active docs structure, archive structure, app-review workspace |
| Stage 1: Product scope freeze | `in_progress` | Stage 0 | reviewer scope definition, excluded features list, release-channel decisions |
| Stage 2: Phase 1 surface cleanup | `done` | Stage 1 | no legacy reviewer-visible surfaces, no fake billing/review-confusing UI |
| Stage 3: Meta integration consolidation | `done` | Stage 2 | one OAuth flow, one scope registry, one verified Graph version policy |
| Stage 4: Security and capability layer | `in_progress` | Stage 3 | encrypted token handling, persisted scopes/capabilities, normalized secret/env loading |
| Stage 5: OpenRouter-first AI migration | `not_started` | Stage 2 | one shared AI adapter for migrated text flows, truthful provider model |
| Stage 6: Reviewer-safe UX and compliance | `not_started` | Stage 3, Stage 4 | reviewer path, public compliance pages, aligned reviewer docs |
| Stage 7: Reliability hardening | `not_started` | Stage 4, Stage 5, Stage 6 | stable publish/schedule behavior, health/status surfaces, deploy checks |
| Stage 8: Submission package finalization | `not_started` | Stage 7 | final reviewer assets, test credentials, screencast package |
| Stage 9: Post-approval expansion | `not_started` | Stage 8 | comments, analytics, messaging, billing added without regressing review-safe core |

## Implementation Order

| Order | Stage | Why this order is safe |
|---|---|---|
| 1 | Stage 1: Product scope freeze | prevents architecture drift before code work |
| 2 | Stage 2: Phase 1 surface cleanup | removes misleading UI and stale entry points early |
| 3 | Stage 3: Meta integration consolidation | stabilizes the most critical external integration |
| 4 | Stage 4: Security and capability layer | makes later UX and automation decisions deterministic |
| 5 | Stage 5: OpenRouter-first AI migration | can proceed after surface cleanup without destabilizing Meta review scope |
| 6 | Stage 6: Reviewer-safe UX and compliance | should be built on top of stable integration/security rules |
| 7 | Stage 7: Reliability hardening | validates the actual release candidate, not a moving target |
| 8 | Stage 8: Submission package finalization | only make reviewer assets after the product is stable |
| 9 | Stage 9: Post-approval expansion | isolated from the review-safe core |

## Current Notes

- Stage 0 is complete.
- Stage 1 is still open until the release-channel env and Phase 1 scope are locked in deployed configuration.
- Stage 2 is complete:
  - release-channel gating utility added
  - blocked dashboard routes are redirected in `proxy.ts`
  - desktop/mobile navigation hides review-excluded surfaces
  - dashboard quick actions no longer expose blocked routes
  - subscription and pricing surfaces no longer present fake live billing behavior
  - legacy reviewer-visible Meta OAuth path is hard-disabled
- Stage 3 is complete:
  - legacy `/api/auth/social/*` routes now hard-redirect to the canonical Meta flow entry surface instead of executing legacy OAuth logic
  - shared Meta Graph version policy introduced for Next.js/server and edge runtimes
  - active `v24.0`, `v19.0`, and `v18.0` usages were removed from active code paths in favor of `v21.0`
  - env examples and review ops docs are aligned with the canonical Meta flow, `APP_RELEASE_CHANNEL`, and `META_OAUTH_SCOPE_PROFILE`
  - reviewer-facing submission assets were moved into `docs/app-review/`
- Stage 4 is in progress:
  - canonical Meta connect flow now stores encrypted page tokens and encrypted user tokens at the application layer
  - granted scopes and derived capabilities are now persisted on connected social accounts
  - review-critical publish paths now decrypt tokens through a shared accessor layer
