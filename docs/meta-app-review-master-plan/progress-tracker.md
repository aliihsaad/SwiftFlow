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
| Stage 1: Product scope freeze | `done` | Stage 0 | reviewer scope definition, excluded features list, release-channel decisions |
| Stage 2: Phase 1 surface cleanup | `done` | Stage 1 | no legacy reviewer-visible surfaces, no fake billing/review-confusing UI |
| Stage 3: Meta integration consolidation | `done` | Stage 2 | one OAuth flow, one scope registry, one verified Graph version policy |
| Stage 4: Security and capability layer | `done` | Stage 3 | encrypted token handling, persisted scopes/capabilities, normalized secret/env loading |
| Stage 5: OpenRouter-first AI migration | `done` | Stage 2 | one shared AI adapter for migrated text flows, truthful provider model |
| Stage 6: Reviewer-safe UX and compliance | `done` | Stage 3, Stage 4 | reviewer path, public compliance pages, aligned reviewer docs |
| Stage 7: Reliability hardening | `in_progress` | Stage 4, Stage 5, Stage 6 | stable publish/schedule behavior, health/status surfaces, deploy checks |
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
- Stage 1 is complete:
  - Phase 1 reviewer scope is frozen
  - requested Meta permissions are narrowed to the Phase 1 publish-only set
  - review deployment env decisions are locked around `APP_RELEASE_CHANNEL=review_phase_1` and `META_OAUTH_SCOPE_PROFILE=review_phase_1`
  - excluded reviewer features explicitly include webhook-driven automations
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
- Stage 4 is complete:
  - canonical Meta connect flow now stores encrypted page tokens and encrypted user tokens at the application layer
  - granted scopes and derived capabilities are now persisted on connected social accounts
  - review-critical publish paths now decrypt tokens through a shared accessor layer
  - active message, comment, webhook, automation, and analytics sync loaders now hydrate Meta accounts through shared decrypt helpers instead of assuming raw DB tokens
  - read-only analytics routes now only read social-account metadata they actually need, and `sync-analytics` logs now summarize Meta failures instead of dumping raw provider payloads
  - review-phase webhook deliveries are now acknowledged without executing webhook-driven side effects
  - active message send/read, comment moderation, analytics sync, media readers, automation creation, background syncs, legacy automation polling, and canvas graph execution now enforce derived Meta capabilities instead of relying on token presence alone
- Stage 5 is complete:
  - `openrouter` is now being introduced as a first-class provider in workspace settings, schema, and runtime defaults
  - new workspace settings will default to `openrouter` instead of Gemini
  - model listing and API-key validation are being expanded to include OpenRouter's official `/api/v1/models` and `/api/v1/key` endpoints
  - workspace AI configuration is being split into separate text-model and image-model settings, with legacy `ai_model_name` mirrored to the text model during migration
  - the settings UI now shows provider-aware model guidance for lower-cost, balanced, and higher-quality choices instead of a single raw model dropdown
  - migrated text-generation flows now resolve through the shared provider runtime instead of per-function Gemini/OpenAI branching
  - `research-topic` is now an explicit Gemini-grounded exception until OpenRouter web search is proven stable enough for review-safe use
  - Stage 5 schema migrations have been applied to Supabase and the updated AI edge functions have been deployed
- Stage 6 is complete:
  - `/privacy`, `/data-deletion`, and `/terms` are being rewritten to describe the real product data flows and deletion path
  - reviewer mode is now being surfaced in the dashboard header and dashboard landing experience
  - app-review submission, screencast, and ops docs now match the reviewer-safe Phase 1 UI and route flow
- Stage 7 is in progress:
  - build-time environment validation is being added so misconfigured review deployments fail before release
  - dashboard integration health messaging is being added to show whether connected publishing paths are actually review-ready
  - post publish attempts are being normalized into persisted failure summaries and per-platform results
  - brand settings now exposes whether connected accounts are publish-ready or need re-auth
  - the Stage 7 Supabase migration has been applied and `process-scheduled-posts` has been redeployed
  - live review-environment publish verification is still pending before Stage 7 can close
