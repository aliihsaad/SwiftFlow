# Phase 1 Security and Access Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden authorization, scopes, RLS, tokens, secrets, rate limits, and audit logs before public scale or paid gating.

**Architecture:** Centralize authorization patterns, then enforce them consistently across app routes, Developer API routes, MCP tools, assistant write paths, Supabase policies, and Edge Functions. Tests must prove cross-workspace attacks and under-scoped API keys fail.

**Tech Stack:** Next.js API routes, Supabase Auth/RLS/Postgres, Developer API/MCP, Vitest, Vercel env/security headers.

---

## Research Checkpoint

- [x] Use OWASP API Security Top 10 2023 as the threat baseline.
- [x] Review Supabase RLS, Security Advisor, and production checklist before changing policies.
- [x] Review MCP authorization specification before changing connector OAuth/session behavior.
- [x] Review Vercel security header, WAF, Deployment Protection, and environment variable docs before infrastructure changes.

## Files

- Modify: `lib/workspace-rbac.ts`
- Modify: `lib/workspace-permissions.ts`
- Modify: `lib/workspace-utils.ts`
- Modify: `lib/developer-api/auth.ts`
- Modify: `lib/developer-api/scopes.ts`
- Modify: `lib/developer-api/rate-limit.ts`
- Modify: `lib/developer-api/audit.ts`
- Modify: `lib/developer-api/oauth.ts`
- Modify: `lib/developer-api/mcp.ts`
- Modify: `app/api/developer/**/route.ts`
- Modify: `app/api/assistant/**/route.ts`
- Modify: `supabase/migrations/**`
- Create: `tests/security/workspace-authorization.test.ts`
- Create: `tests/security/developer-api-scope-matrix.test.ts`
- Create: `tests/security/rls-policy-inventory.test.ts`
- Create: `docs/security/security-hardening-results.md`

## Tasks

- [x] Build a shared authorization checklist in `docs/security/security-hardening-results.md`: user auth, workspace membership, role, object ownership, allowed fields, audit requirement, and rate-limit requirement.
- [x] Add tests that try cross-workspace reads and writes for posts, drafts, scheduled posts, automations, media, brand profile, analytics, content intelligence, API keys, assistant history, and generated assets.
- [x] Add tests that try object-property escalation: workspace_id changes, user_id changes, status changes, API key status changes, protected automation graph fields, and unauthorized media URL injection.
- [x] Re-audit `lib/developer-api/scopes.ts` so each write/destructive capability has its own explicit scope.
- [x] Add under-scoped Developer API tests for every route/tool: each route must fail without its exact scope.
- [x] Add revoked/expired API key tests against REST, MCP, OAuth refresh, and connector token use.
- [x] Add audit logging tests for create/update/delete/schedule/publish/toggle/brand-profile/media-generation actions.
- [x] Add per-workspace and per-key rate limits for expensive actions: media generation, upload, content intelligence, analytics refresh, trend research, automation writes, post publish-now, and assistant writes.
- [x] Verify RLS is enabled for user-facing tables using `supabase/schema-map/policies.csv` and live schema exports.
- [x] Add a migration only if RLS or grants are missing; otherwise document verified status.
- [x] Review all secret/token logging paths and remove unsafe logs.
- [x] Add or update security headers and CSP in the Next.js app if missing.

Progress note 2026-05-17: Developer API rate-limit classes are now split for media upload, media generation, analytics refresh, content intelligence, automation writes, and post publish-now. Assistant write paths and any future Developer API trend-research route still need their own rate-limit pass.

Progress note 2026-05-17: Added source-contract tests for workspace ownership on Developer API post/draft/media/brand/analytics/content-intelligence/automation routes, Developer API key management, and assistant chat history. These supplement, but do not replace, full route-level cross-workspace mutation tests.

Progress note 2026-05-17: Added `withDeveloperApiAuth` audit-wrapper tests for success and auth failure. Per-action audit assertions for every write/destructive route remain open.

Progress note 2026-05-17: Added `Content-Security-Policy-Report-Only` in `proxy.ts` plus security-header tests. Enforced CSP should wait for a full origin/asset inventory.

Progress note 2026-05-17: Added `lib/security/redaction.ts`, `supabase/functions/_shared/log-redaction.ts`, tests for sensitive string/object redaction, and applied redaction to high-risk Developer API, assistant command, Meta OAuth callback, publishing, automation, analytics, comment-sync, and message-sync logs. Remaining AI-generation and orchestration Edge Functions still need a final log review.

Progress note 2026-05-18: Added `tests/security/object-property-escalation.test.ts` for post, brand profile, chat-session, workspace-settings, and media URL escalation attempts. Added `tests/security/developer-api-audit-actions.test.ts` to lock the route-specific action/scope/rate-limit contracts for create/schedule/publish/update/delete/toggle/brand/media routes. Completed the remaining AI-generation/orchestration log-redaction pass across generate-caption, generate-carousel, generate-ideas, generate-image, generate-message-reply, generate-reply, chat-assistant, research-topic, automation-orchestrator, automation-worker-run, process-scheduled-executions, and graph-executor. Raw AI response snippets were replaced with length-only logs in high-risk functions.

## Tests and Verification

- [ ] Run `pnpm lint`.
- [x] Run `pnpm test:ci`.
- [x] Run targeted tests:
  - `pnpm test:ci tests/security/workspace-authorization.test.ts`
  - `pnpm test:ci tests/security/developer-api-scope-matrix.test.ts`
  - `pnpm test:ci tests/developer-api`
- [ ] Verify a revoked key fails an MCP call in production or staging. Local code/tests are complete; live connector smoke remains deployment-gated.
- [ ] Verify no logs contain raw API keys, OAuth codes, Meta tokens, or service-role secrets. Source-level redaction is complete; production log sampling remains deployment-gated.

Progress note 2026-05-18: `pnpm test:ci tests/security` passed with 9 files and 33 tests. `pnpm test:ci` passed with 47 files and 178 tests. Targeted ESLint on changed Next.js Developer API routes and new/updated security tests passed. Full `pnpm lint` remains blocked by the existing repository lint baseline.

Progress note 2026-05-18: Added `tests/security/cross-workspace-route-mutations.test.ts` for route-handler cross-workspace mutation coverage on app post PUT/PATCH, brand profile PUT, chat-session POST/PATCH/DELETE, workspace-settings PUT, and assistant workspace resolution. Added `tests/security/developer-api-runtime-audit-routes.test.ts` to execute real Developer API route handlers through `withDeveloperApiAuth` for post create/schedule/publish, draft update/delete, brand-profile write, media upload/generate, automation create/update/toggle/delete. Added `docs/security/phase-1-deployment-smoke-checklist.md` for production-only checks: security headers, CSP report-only review, Vercel Firewall/WAF, Deployment Protection, revoked/expired connector key smoke, and production log sampling. Vercel MCP project lookup returned 403, so WAF/Deployment Protection dashboard verification remains blocked on Vercel project security access.

Progress note 2026-05-18: Closed the remaining local Phase 1 auth/rate-limit gaps. `tests/security/developer-api-scope-matrix.test.ts` now checks every Developer API route contract against under-scoped keys. `tests/security/developer-api-mcp-auth-lifecycle.test.ts` verifies expired and wrong-resource OAuth connector access tokens fail at the MCP HTTP boundary. `tests/security/app-expensive-route-rate-limits.test.ts` locks assistant and trend-research app-side rate limits plus redacted error logs. `app/api/developer/mcp/route.ts` now validates OAuth connector tokens before JSON-RPC tool handling. `app/api/content-intelligence/trend-report/route.ts` now rate-limits by workspace user and IP before provider calls. `pnpm test:ci tests/security` passed with 13 files and 45 tests. `pnpm test:ci tests/developer-api` passed with 30 files and 125 tests. `pnpm test:ci` passed with 51 files and 190 tests. Targeted ESLint on the changed close-out files passed.

## Exit Gate

- [ ] Phase 1 is complete only when cross-workspace access tests pass, Developer API scope tests pass, revoked/expired token tests pass, RLS status is documented, and no critical/high security findings remain unassigned. As of 2026-05-18, local code/test gates are complete; live Vercel/connector/log gates remain deployment-gated.
