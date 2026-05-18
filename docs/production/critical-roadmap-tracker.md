# SwiftFlow Critical Production Roadmap Tracker

Status date: 2026-05-18
Active branch during tracker creation: `content-intelligence-phase-3`
Canonical project: `Social-Media-Manager-AI-Tool`

This tracker is the source of truth for the production hardening program. It maps the user-approved roadmap, Vault open loops, security gates, implementation plans, verification status, and launch blockers.

## Baseline References

- OWASP API Security Top 10 2023: https://owasp.org/www-project-api-security/
- Supabase production checklist: https://supabase.com/docs/guides/deployment/going-into-prod
- Vercel production checklist: https://vercel.com/docs/production-checklist
- MCP authorization draft: https://modelcontextprotocol.io/specification/draft/basic/authorization
- OpenAI Actions production notes: https://developers.openai.com/api/docs/actions/production
- Stripe subscription webhooks: https://docs.stripe.com/billing/subscriptions/webhooks

## Program Rules

- Every phase starts from Vault recall and ends with a Vault update or explicit loop closure.
- No production-critical security change should be treated as complete without tests and a smoke-check plan.
- Developer API and connector access remain fully available while payments are not implemented. Paid gates are prepared but not locked.
- Every workspace-scoped read/write must prove user membership, role, object ownership, and field-level permission where relevant.
- All write, destructive, publish, send, upload, and expensive provider actions need audit events.
- All destructive actions need confirmation semantics in UI/API clients and clear MCP/OpenAPI annotations.
- External-provider calls need timeout, retry/backoff, rate limit, request ID logging, error normalization, and cost controls.
- Unknown provider behavior must be researched from current official docs before implementation.

## Phase Board

| Phase | Status | Owner | Plan file | Exit gate | Vault / notes |
| --- | --- | --- | --- | --- | --- |
| 0. Program Tracker and Security Inventory | Completed with lint debt | Codex | `docs/superpowers/plans/2026-05-16-phase-0-program-tracker-security-inventory.md` | Tracker, endpoint inventory, data-flow map, threat model, and test matrix exist and coverage checks passed | `vm_xVHGcS1Fd2u-8Sal` |
| 1. Security and Access Hardening | Local code/test gates complete; deployment smoke pending | Codex | `docs/superpowers/plans/2026-05-16-phase-1-security-access-hardening.md` | BOLA, scopes, RLS, secret, rate-limit, OAuth/session, and audit checks pass locally; live connector/log/WAF checks remain deployment-gated | `vm_6aUkXGCcypOXQozW`, `vm_W9H-pk76iYRRfBrG` |
| 2. Reliability and Observability | Not started | Codex | `docs/superpowers/plans/2026-05-16-phase-2-reliability-observability.md` | Request IDs, logs, retries, idempotency, alerting, and load tests are in place | `vm_p51HH5p3jBUk0bxH`, `vm_mZq7shqQs1RQNY_p` |
| 3. Retention, Media Limits, and Cost Controls | Not started | Codex | `docs/superpowers/plans/2026-05-16-phase-3-retention-media-cost-controls.md` | Free/Paid retention and cleanup are implemented with dry-run safety | `vm_unQXY4rKc8wKqnhF`, `vm_L6qEurMvvuXXu6fs` |
| 4. AI Assistant Confirmed Write Actions | Not started | Codex | `docs/superpowers/plans/2026-05-16-phase-4-ai-assistant-confirmed-write-actions.md` | Assistant can safely create/update only after explicit confirmation and audit | `vm_Iso8OUM913XTydT8`, `vm_JS3nqNFNQ4KXajNN` |
| 5. Stage 9B Publishing Automation Hardening | Not started | Codex | `docs/superpowers/plans/2026-05-16-phase-5-stage-9b-publishing-hardening.md` | Three consecutive due-runs create valid drafts/media without duplicate output | `vm_uP7PUpsuJ7Nm7khc`, `vm_TPUzQi1vbRqry3tB` |
| 6. Meta Permission Review Preparation | Not started | Codex/User | `docs/superpowers/plans/2026-05-16-phase-6-meta-permission-review-prep.md` | Reviewer can reproduce every requested permission flow from clean test accounts | `vm_oo8HvSoXVOtS-QsP` |
| 7. Content Intelligence Real Providers | Not started | Codex | `docs/superpowers/plans/2026-05-16-phase-7-content-intelligence-real-providers.md` | Provider decision, evidence labels, cache, quotas, and fallback behavior are clear | `vm_JrBj09wmcXm4K4pm`, `vm_3FsXSBKpdJ633gSF` |
| 8. Payments and Entitlements | Not started | Codex | `docs/superpowers/plans/2026-05-16-phase-8-payments-entitlements.md` | Paid gates work without breaking current owner/admin beta testing flows | `vm_Zu9F3ly9C2jg0KQA` |
| 9. Final Launch Readiness | Not started | Codex/User | `docs/superpowers/plans/2026-05-16-phase-9-final-launch-readiness.md` | Production smoke tests, rollback, backups, monitoring, and accepted risks are green | All active launch loops |

## Phase 0 Artifacts

| Artifact | Status | Purpose |
| --- | --- | --- |
| `docs/security/api-inventory.md` | Complete | Route, Edge Function, and MCP tool inventory with auth/capability classification |
| `docs/security/data-flow-map.md` | Complete | Trust boundaries and data flows for workspace, posts, media, analytics, automations, tokens, billing, and assistant |
| `docs/security/threat-model.md` | Complete | Threats mapped to OWASP, Meta, MCP, Supabase, Stripe, and internal scheduler risks |
| `docs/security/security-test-matrix.md` | Complete | Required tests before production hardening can be called complete |

## Active Open Loops

| Vault UID | Loop | Roadmap phase | Handling |
| --- | --- | --- | --- |
| `vm_xVHGcS1Fd2u-8Sal` | Critical production roadmap and security hardening tracker | Phase 0 | Phase 0 artifacts created and coverage-verified; keep active for next phase transition |
| `vm_unQXY4rKc8wKqnhF` | Database retention cleanup draft | Phase 3 | Keep open until retention windows and cleanup dry-run are implemented |
| `vm_L6qEurMvvuXXu6fs` | Media storage limits and cleanup strategy | Phase 3 | Keep open until quotas and cleanup policy are implemented |
| `vm_mZq7shqQs1RQNY_p` | Stale MCP analytics read-through sync | Phase 2 | Verify after deploy; close only after user confirms connector analytics stays fresh |
| `vm_uP7PUpsuJ7Nm7khc` | Stage 9B scheduled publishing runner | Phase 5 | Keep open until repeated due-run validation passes |
| `vm_3FsXSBKpdJ633gSF` | Content Intelligence Phase 1 implementation plan | Phase 7 or archive after confirmation | Re-check against commits before closing |
| `vm_6aUkXGCcypOXQozW` | Developer API OAuth hardening after connector launch | Phase 1 | Keep open for DB-backed sessions/revocation review |
| `vm_Zu9F3ly9C2jg0KQA` | Developer API paid-plan only later, do not lock now | Phase 8 | Implement only when payments are ready |
| `vm_Iso8OUM913XTydT8` | AI Assistant command center direction | Phase 4 | Continue with confirmation-driven write actions |

## Deployment and Commit Tracking

| Phase | Branch / commit | Deployment link | Smoke test result |
| --- | --- | --- | --- |
| 0 | Pending commit | Pending | Inventory coverage passed; `pnpm test:ci` passed; `pnpm lint` failed on existing lint baseline |
| 1 | Pending commit | Pending | Security docs/tests added; Developer API and app expensive route rate limits split; report-only CSP and high-risk app/Edge log redaction added; full `pnpm test:ci` passed with 51 files / 190 tests; full `pnpm lint` still blocked by existing repo lint baseline |
| 2 | Pending | Pending | Pending |
| 3 | Pending | Pending | Pending |
| 4 | Pending | Pending | Pending |
| 5 | Pending | Pending | Pending |
| 6 | Pending | Pending | Pending |
| 7 | Pending | Pending | Pending |
| 8 | Pending | Pending | Pending |
| 9 | Pending | Pending | Pending |

## Current Stop Conditions

Implementation must pause for research or explicit decision before:

- Changing Meta permission behavior, webhook subscriptions, message delivery assumptions, or app-review claims.
- Locking Developer API/MCP behind paid plans before Stripe/entitlement implementation is complete.
- Enabling destructive cleanup jobs outside dry-run mode.
- Replacing OAuth token/session storage design.
- Adding new trend/research providers or scraping sources.
- Enabling auto-publish behavior instead of draft-only publishing automation.

## Phase 0 Verification Record

Completed on 2026-05-17:

- Created `docs/production/critical-roadmap-tracker.md`.
- Created `docs/security/api-inventory.md`.
- Created `docs/security/data-flow-map.md`.
- Created `docs/security/threat-model.md`.
- Created `docs/security/security-test-matrix.md`.
- Verified every `app/api/**/route.ts` appears in `docs/security/api-inventory.md`.
- Verified every `supabase/functions/**` directory appears in `docs/security/api-inventory.md`.
- Verified every `swiftflow_*` MCP tool appears in `docs/security/api-inventory.md`.
- Ran `pnpm test:ci`: 38 test files passed, 145 tests passed.
- Ran `pnpm lint`: failed on existing repository lint debt, mostly `no-explicit-any`, `@ts-nocheck` in Edge Functions, and React lint findings. No new lintable source files were added in Phase 0.

## Phase 1 Verification Record

Started on 2026-05-17:

- Created `docs/security/security-hardening-results.md` with the shared authorization checklist, current verified controls, official research references, test coverage, and remaining findings.
- Added `tests/security/workspace-authorization.test.ts`.
- Added `tests/security/developer-api-scope-matrix.test.ts`.
- Added `tests/security/rls-policy-inventory.test.ts`.
- Added `tests/security/workspace-object-ownership.test.ts`.
- Added `tests/security/developer-api-audit-wrapper.test.ts`.
- Added `tests/security/security-headers.test.ts`.
- Added `tests/security/secret-redaction.test.ts`.
- Added `tests/security/developer-api-audit-actions.test.ts`.
- Added `tests/security/object-property-escalation.test.ts`.
- Added `tests/security/cross-workspace-route-mutations.test.ts`.
- Added `tests/security/developer-api-runtime-audit-routes.test.ts`.
- Added `tests/security/developer-api-mcp-auth-lifecycle.test.ts`.
- Added `tests/security/app-expensive-route-rate-limits.test.ts`.
- Added `docs/security/phase-1-deployment-smoke-checklist.md`.
- Added `tests/security/**/*.test.ts` to `vitest.config.ts`.
- Split Developer API rate limits for media upload, media generation, analytics refresh, content intelligence, automation writes, and publish-now.
- Updated Developer API route configs to use the stricter rate-limit classes.
- Added `Content-Security-Policy-Report-Only` to `proxy.ts` as a safe CSP baseline before enforcement.
- Added `lib/security/redaction.ts` and applied it to high-risk Developer API and Meta OAuth callback logs.
- Applied app log redaction to the assistant command route.
- Added `supabase/functions/_shared/log-redaction.ts` and applied it to high-risk publishing, automation, analytics, comment-sync, and message-sync Edge Function logs.
- Expanded log redaction to Developer API key-management/support routes plus AI-generation, research, orchestration, scheduled-execution, and graph-executor Edge Function paths.
- Replaced raw AI response/reply snippets with length-only logs in high-risk generation functions.
- Added MCP HTTP-boundary validation for expired or wrong-resource OAuth connector access tokens.
- Added user/workspace and IP rate limits plus redacted error logging to content-intelligence trend research.
- Verified assistant command/invoke rate-limit and redaction contracts.
- Ran `pnpm test:ci tests/security`: 7 test files passed, 25 tests passed.
- Ran `pnpm test:ci tests/developer-api`: 30 test files passed, 125 tests passed.
- Ran `pnpm test:ci`: 45 test files passed, 170 tests passed.
- Ran `pnpm test:ci tests/security`: 9 test files passed, 33 tests passed.
- Ran `pnpm test:ci`: 47 test files passed, 178 tests passed.
- Ran `pnpm test:ci tests/security`: 11 test files passed, 40 tests passed.
- Ran `pnpm test:ci tests/security`: 13 test files passed, 45 tests passed.
- Ran `pnpm test:ci tests/developer-api`: 30 test files passed, 125 tests passed.
- Ran `pnpm test:ci`: 51 test files passed, 190 tests passed.
- Ran targeted ESLint on changed Phase 1 source/test files: passed.
- Ran targeted ESLint on changed Next.js Developer API routes and new/updated security tests: passed.
- Ran targeted ESLint on the final Phase 1 close-out files: passed.
- Ran `pnpm lint`: failed on existing repository lint debt, mostly `no-explicit-any`, `@ts-nocheck` in Edge Functions, and React lint findings outside the Phase 1 touched files.

Remaining Phase 1 work:

- Full cross-workspace and runtime audit local tests are now in place.
- CSP design and deployment smoke checklist are documented; WAF/Deployment Protection dashboard/API verification is blocked by Vercel MCP `403 Forbidden`.
- Production/staging smoke test for revoked API keys against MCP connector calls remains deployment-gated.
- Production log sampling for secret redaction remains deployment-gated.
