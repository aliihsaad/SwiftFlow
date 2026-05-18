# Critical Production Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring SwiftFlow from working feature-complete beta into a secure, reliable, paid-plan-ready production app with clear progress tracking.

**Architecture:** Treat this as a gated production program, not a loose feature backlog. Each phase has a defined deliverable, security/reliability acceptance gates, tests, deployment verification, and Vault closure/update. Security hardening runs before public scale, Meta review, and payment enforcement.

**Tech Stack:** Next.js App Router, Supabase Postgres/Auth/Storage/Edge Functions, Vercel, Meta Graph API, Developer API/MCP, AI Assistant, automation runner, scheduled publishing, Vitest/Playwright/k6-style load tests.

---

## Baseline References

Use these as the minimum production baseline:

- OWASP API Security Top 10 2023: object-level authorization, authentication, object-property authorization, resource consumption, function-level authorization, sensitive business flows, SSRF, misconfiguration, inventory, and unsafe third-party API consumption.
  - https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- Supabase production checklist: RLS on all tables, Security Advisor, SSL enforcement, network restrictions, MFA, backups/PITR, Performance Advisor, load testing, and abuse prevention.
  - https://supabase.com/docs/guides/deployment/going-into-prod
- Vercel production checklist: incident response, rollback strategy, CSP/security headers, Deployment Protection, WAF, Log Drains, rate limiting, access roles, observability/tracing, load testing, function region/duration review, and cost controls.
  - https://vercel.com/docs/production-checklist

## Program Rules

- [ ] Every phase starts from a clean Vault recall and ends with a Vault update or loop closure.
- [ ] Every phase gets its own branch or isolated commit sequence.
- [ ] Every production-facing change must include tests and a production smoke-check plan.
- [ ] Do not gate paid features until payment infrastructure is ready. Keep current Developer API and connector testing available.
- [ ] No new broad feature work should bypass the security/reliability gates below.
- [ ] All destructive actions must have confirmation UI/API semantics and audit logs.
- [ ] All workspace-scoped reads/writes must prove workspace membership and object ownership.
- [ ] Every external-provider call must have timeout, retry, rate-limit, logging, and cost controls.

## Tracking Board

| Phase | Status | Owner | Exit Gate |
| --- | --- | --- | --- |
| 0. Program Tracker and Security Inventory | Completed with lint debt | Codex | Canonical checklist, endpoint inventory, data-flow map, and threat model exist |
| 1. Security and Access Hardening | Not started | Codex | BOLA/scope/RLS/secret/rate-limit audit passes |
| 2. Reliability and Observability | Not started | Codex | Logs, metrics, request IDs, alerts, retries, and load tests are in place |
| 3. Retention, Media Limits, and Cost Controls | Not started | Codex | Free/Paid retention policy and cleanup jobs are implemented safely |
| 4. AI Assistant Phase 3 Write Actions | Not started | Codex | Assistant can safely create/update with confirmation and audit trail |
| 5. Stage 9B Publishing Automation Hardening | Not started | Codex | One real due-run creates draft + media without repair |
| 6. Meta Permission Review Preparation | Not started | Codex/User | Reviewer path, screencast, permission matrix, and test accounts are ready |
| 7. Content Intelligence Phase 4 Providers | Not started | Codex | Provider decision, cost controls, caching, and UI entry points are ready |
| 8. Payments and Entitlements | Not started | Codex | Paid plan gates work without breaking existing tested flows |
| 9. Final Launch Readiness | Not started | Codex/User | Production checklist, rollback, backups, smoke tests, and monitoring pass |

## Phase Plan Files

- Phase 0: `docs/superpowers/plans/2026-05-16-phase-0-program-tracker-security-inventory.md`
- Phase 1: `docs/superpowers/plans/2026-05-16-phase-1-security-access-hardening.md`
- Phase 2: `docs/superpowers/plans/2026-05-16-phase-2-reliability-observability.md`
- Phase 3: `docs/superpowers/plans/2026-05-16-phase-3-retention-media-cost-controls.md`
- Phase 4: `docs/superpowers/plans/2026-05-16-phase-4-ai-assistant-confirmed-write-actions.md`
- Phase 5: `docs/superpowers/plans/2026-05-16-phase-5-stage-9b-publishing-hardening.md`
- Phase 6: `docs/superpowers/plans/2026-05-16-phase-6-meta-permission-review-prep.md`
- Phase 7: `docs/superpowers/plans/2026-05-16-phase-7-content-intelligence-real-providers.md`
- Phase 8: `docs/superpowers/plans/2026-05-16-phase-8-payments-entitlements.md`
- Phase 9: `docs/superpowers/plans/2026-05-16-phase-9-final-launch-readiness.md`

## Phase 0 Produced Artifacts

- Tracker: `docs/production/critical-roadmap-tracker.md`
- API inventory: `docs/security/api-inventory.md`
- Data-flow map: `docs/security/data-flow-map.md`
- Threat model: `docs/security/threat-model.md`
- Security test matrix: `docs/security/security-test-matrix.md`

Phase 0 verification on 2026-05-17:

- Coverage checks passed for all `app/api/**/route.ts`, all `supabase/functions/**` directories, and all `swiftflow_*` MCP tools.
- `pnpm test:ci` passed: 38 test files, 145 tests.
- `pnpm lint` failed on existing lint baseline unrelated to the Phase 0 docs.

---

## Phase 0: Program Tracker and Security Inventory

**Purpose:** Create the source of truth before changing security-critical code.

**Files likely involved:**
- Create: `docs/production/critical-roadmap-tracker.md`
- Create: `docs/security/api-inventory.md`
- Create: `docs/security/threat-model.md`
- Create: `docs/security/security-test-matrix.md`
- Read/update: `docs/superpowers/plans/*`
- Read/update: `lib/developer-api/*`
- Read/update: `app/api/**/route.ts`
- Read/update: `supabase/functions/**`

**Tasks:**

- [ ] Create a canonical tracker that mirrors this roadmap with checkbox status, commit links, deployment links, and Vault item IDs.
- [ ] Build an endpoint inventory for all `app/api/**/route.ts`, Supabase Edge Functions, MCP tools, scheduled jobs, and webhook handlers.
- [ ] Classify each endpoint by auth method, workspace scope, data read/write level, destructive capability, external-provider calls, cost impact, and audit-log requirement.
- [ ] Build a data-flow map for posts, media, analytics, automations, Developer API tokens, OAuth connector tokens, Meta tokens, assistant write actions, and generated assets.
- [ ] Create a threat model focused on OWASP API risks, Meta token abuse, service-role misuse, connector token leakage, SSRF/media upload risks, and cost exhaustion.
- [ ] Define the production release gates used by every later phase.

**Exit gate:**

- [ ] No critical production work continues until endpoint inventory and threat model exist.
- [ ] Every open Vault loop is mapped to a phase or explicitly marked deferred.

---

## Phase 1: Security and Access Hardening

**Purpose:** Close the highest-risk issues before scale: authorization, token lifecycle, scopes, RLS, secrets, rate limits, and audit trails.

**Files likely involved:**
- `lib/developer-api/auth.ts`
- `lib/developer-api/scopes.ts`
- `lib/developer-api/rate-limit.ts`
- `lib/developer-api/audit.ts`
- `lib/developer-api/oauth.ts`
- `lib/workspace/*`
- `app/api/developer/**`
- `app/api/assistant/**`
- `app/api/**/route.ts`
- `supabase/migrations/**`
- `supabase/functions/**`
- `tests/developer-api/**`
- `tests/security/**`

### 1A. Workspace and Object Authorization

- [ ] Add a shared authorization checklist for every route: authenticated user, workspace membership, role, object ownership, field-level write permission.
- [ ] Add tests for cross-workspace access denial on posts, drafts, scheduled posts, automations, media, brand profile, analytics, content intelligence, and API keys.
- [ ] Add tests for object-property authorization: partial update must not allow protected fields or foreign workspace IDs.
- [ ] Confirm all service-role reads have explicit workspace filters and do not trust client-provided workspace IDs without membership validation.

**Exit gate:**

- [ ] Cross-workspace read/write attempts fail for every critical object type.

### 1B. Developer API and MCP Security

- [ ] Re-audit every Developer API scope against actual route behavior.
- [ ] Split dangerous write scopes where needed: post create, post update, post delete, schedule, publish-now, automation create, automation update, automation toggle, automation delete, brand profile write, media upload, media generate.
- [ ] Confirm revoked/expired keys fail on REST, MCP, OAuth refresh, and active connector sessions.
- [ ] Add API audit logs for all write/destructive actions, including actor, key ID, tool name, route, workspace, target object, and request ID.
- [ ] Add per-key and per-workspace rate limits for expensive tools: image generation, trend research, analytics refresh, content intelligence, automation writes, and media upload.
- [ ] Ensure MCP tool schemas reject unexpected dangerous inputs and never allow raw arbitrary route calls.

**Exit gate:**

- [ ] A full scope matrix exists and tests prove each scope allows only its intended action.

### 1C. OAuth Connector Hardening

- [ ] Decide whether to replace encrypted self-contained OAuth connector tokens with opaque DB-backed sessions before paid/public rollout.
- [ ] If DB-backed sessions are chosen, store only hashed session/refresh tokens and bind each session to workspace, API key, connector client, scopes, expiry, and revocation status.
- [ ] Add session cleanup for expired/revoked connector tokens.
- [ ] Add reauth behavior that does not force users to create a new API key when only connector tokens expire.

**Exit gate:**

- [ ] Connector sessions can be revoked centrally and cannot outlive the backing Developer API key.

### 1D. Supabase and Infrastructure Security

- [ ] Run Supabase Security Advisor and record findings.
- [ ] Verify RLS is enabled on every user-facing table, with policies for workspace ownership.
- [ ] Verify service-role-only tables cannot be read by client keys.
- [ ] Verify SSL enforcement, org MFA, and owner/admin access hygiene.
- [ ] Review Vercel env vars and remove unused secrets.
- [ ] Add or verify CSP and security headers.
- [ ] Add Vercel WAF/rate-limit rules where plan supports it.
- [ ] Ensure logs do not print API keys, OAuth codes, Meta tokens, service-role keys, or generated secret values.

**Exit gate:**

- [ ] Security checklist has no critical or high unresolved findings.

---

## Phase 2: Reliability and Observability

**Purpose:** Make the backend understandable under real production load and failure.

**Files likely involved:**
- `lib/observability/*`
- `lib/developer-api/*`
- `app/api/**`
- `supabase/functions/**`
- `supabase/migrations/**`
- `tests/reliability/**`
- `scripts/load/**`

### 2A. Request IDs and Structured Logs

- [ ] Standardize request IDs across Next.js routes, MCP calls, Supabase Edge Functions, webhooks, scheduler ticks, automation runs, and Meta API calls.
- [ ] Include workspace ID, route/tool name, operation, latency, result, and safe error code in logs.
- [ ] Add a debug guide for tracing one user-visible failure from ChatGPT/Claude request ID to app logs.

### 2B. Scheduler and Webhook Reliability

- [ ] Add idempotency keys for scheduler-tick work, scheduled publishing, automation executions, webhook events, and media generation attach flows.
- [ ] Add concurrency locks for due-run jobs so two workers cannot publish/create duplicate drafts.
- [ ] Add retry policy and dead-letter/error table for failed automation runs and publishing runs.
- [ ] Add replay protection for Meta webhooks.

### 2C. Load and Abuse Tests

- [ ] Add load tests for Developer API key auth, MCP tool calls, analytics read-through sync, image generation timeout handling, media upload, scheduler tick, and webhook bursts.
- [ ] Add budget/cost tests for expensive flows so loops cannot generate unbounded images, emails, or provider calls.
- [ ] Document expected limits for Free, Paid, and internal/test workspaces.

**Exit gate:**

- [ ] A simulated traffic burst does not duplicate jobs, leak cross-workspace data, or exhaust expensive providers.

---

## Phase 3: Retention, Media Limits, and Cost Controls

**Purpose:** Prevent production database/storage bloat and align cleanup with paid plans.

**Files likely involved:**
- `docs/app-review/ops/database-retention-cleanup-draft-2026-04-09.md`
- `docs/production/retention-policy.md`
- `supabase/migrations/**`
- `supabase/functions/cleanup-retention/**`
- `lib/billing/*`
- `lib/storage/*`
- `components/settings/**`

**Tasks:**

- [ ] Define retention windows for Free and Paid/Pro:
  - analytics snapshots
  - generated assets
  - uploaded media
  - chat sessions
  - automation runs
  - publishing automation runs
  - API audit logs
  - rate-limit buckets
- [ ] Define storage quotas per plan:
  - max media storage
  - max generated images per month
  - max video uploads
  - max Developer API calls
  - max connector sessions/API keys
- [ ] Create cleanup jobs that never delete active scheduled/published media needed by live posts.
- [ ] Add soft-delete/grace periods for downgrade and expired subscriptions.
- [ ] Add UI disclosure in Settings/Subscription and Data Deletion pages.
- [ ] Add admin-only cleanup dry-run logs before destructive cleanup is enabled.

**Exit gate:**

- [ ] Cleanup can run in dry-run mode and report exact deletions before deleting anything.

---

## Phase 4: AI Assistant Phase 3 Confirmed Write Actions

**Purpose:** Make the assistant powerful without making it dangerous.

**Files likely involved:**
- `components/ai-assistant/**`
- `app/api/assistant/command/route.ts`
- `app/api/assistant/actions/**`
- `lib/assistant/**`
- `lib/developer-api/*`
- `tests/assistant/**`

**Write actions to support first:**

- [ ] Create draft post.
- [ ] Update draft post text/media.
- [ ] Schedule draft post.
- [ ] Generate and append media to post.
- [ ] Edit brand profile fields safely.
- [ ] Create automation from approved templates.
- [ ] Activate/deactivate automation.
- [ ] Summarize analytics and propose next action.

**Safety model:**

- [ ] Assistant proposes action as a structured preview card.
- [ ] User sees exact target object, before/after diff, scopes needed, and side effects.
- [ ] User confirms before any write.
- [ ] Destructive actions require a stronger confirmation.
- [ ] Every write creates an audit log.
- [ ] Mobile UI must use compact cards and fixed-width-safe layouts.

**Exit gate:**

- [ ] Assistant cannot mutate anything without explicit confirmation and tests cover rejection/cancel paths.

---

## Phase 5: Stage 9B Publishing Automation Hardening

**Purpose:** Prove scheduled AI publishing works reliably before adding auto-publish.

**Files likely involved:**
- `supabase/functions/process-publishing-automations/**`
- `supabase/functions/scheduler-tick/**`
- `app/api/publishing-automations/**`
- `components/automation/**`
- `tests/publishing-automations/**`

**Tasks:**

- [ ] Run one real production due-run where an active publishing automation creates a draft and attaches generated media with no manual repair.
- [ ] Add visible run history with success/failure reason, draft link, generated prompt, media URL, and retry state.
- [ ] Add idempotency for due runs.
- [ ] Add pause/disable controls.
- [ ] Add quality guardrails for duplicate topics, low-quality captions, missing media, and provider timeout.
- [ ] Design auto-publish controls only after draft-only flow is stable.

**Exit gate:**

- [ ] Three consecutive scheduled due-runs create valid drafts/media without duplicate output.

---

## Phase 6: Meta Permission Review Preparation

**Purpose:** Prepare a clean, reviewer-friendly Meta approval path.

**Files likely involved:**
- `docs/app-review/**`
- `docs/meta-app-review-master-plan/**`
- `supabase/functions/meta-webhook/**`
- `lib/meta/**`
- `components/automation/**`

**Tasks:**

- [ ] Separate confirmed product bugs from Meta tester/app-review limitations.
- [ ] Validate Story Reply, DM Reply, Private Reply, public comment reply, and Facebook Page comment flows with role/tester accounts.
- [ ] Confirm exact permission needs for each automation surface.
- [ ] Prepare reviewer screencast scripts and test account instructions.
- [ ] Document why non-role accounts may not receive replies until permissions are approved.
- [ ] Keep publishing automation separate from engagement automation unless Meta review scope requires combining.

**Exit gate:**

- [ ] A reviewer can reproduce every requested permission flow from a clean test account.

---

## Phase 7: Content Intelligence Phase 4 Providers

**Purpose:** Move from benchmark guidance to real trend/research providers without adding unreliable half-solutions.

**Files likely involved:**
- `lib/content-intelligence/**`
- `app/api/content-intelligence/**`
- `app/api/developer/v1/content-intelligence/**`
- `components/analytics/**`
- `tests/content-intelligence/**`

**Tasks:**

- [ ] Choose provider strategy after cost/legal review: DataForSEO, SerpApi, Google Trends-compatible source, or Meta-native-only.
- [ ] Add provider abstraction with timeout, cache, quota, and stale fallback.
- [ ] Add billing entitlement input for standard/deep reports.
- [ ] Add UI entry points for standard/deep reports.
- [ ] Add clear evidence labels: live provider, cached provider, benchmark fallback, workspace analytics.

**Exit gate:**

- [ ] Trend research never blocks core analytics and always labels evidence quality.

---

## Phase 8: Payments and Entitlements

**Purpose:** Gate premium power only after the feature set works.

**Files likely involved:**
- `lib/billing/**`
- `app/api/billing/**`
- `components/subscription/**`
- `lib/developer-api/entitlements.ts`
- `lib/assistant/**`
- `lib/storage/**`
- `supabase/migrations/**`

**Premium candidates:**

- Developer API and MCP connectors.
- Advanced AI Assistant write actions.
- Higher media/generated-image limits.
- Longer retention windows.
- Deep trend research.
- Higher automation/run limits.
- More API keys and connector sessions.

**Tasks:**

- [ ] Define plan matrix.
- [ ] Add entitlement storage.
- [ ] Add non-breaking preview/beta mode for current testing.
- [ ] Add UI gates with upgrade copy.
- [ ] Add backend entitlement checks.
- [ ] Add downgrade grace-period behavior.
- [ ] Add audit/event tracking for plan changes.

**Exit gate:**

- [ ] Turning paid gates on does not break existing owner/admin test flows unexpectedly.

---

## Phase 9: Final Launch Readiness

**Purpose:** Confirm the app is ready for real users and failures.

**Tasks:**

- [ ] Run full test suite and targeted security tests.
- [ ] Run production smoke test:
  - login
  - create post
  - schedule post
  - generate media
  - create automation
  - receive Meta webhook
  - Developer API key call
  - ChatGPT/Claude connector call
  - AI Assistant confirmed write
  - analytics refresh
- [ ] Confirm rollback process.
- [ ] Confirm backup/PITR strategy.
- [ ] Confirm incident response contacts and runbook.
- [ ] Confirm log drains/observability.
- [ ] Confirm rate limits and WAF rules.
- [ ] Confirm app review docs and privacy/data deletion docs.
- [ ] Close or defer every Vault open loop.

**Exit gate:**

- [ ] Production launch checklist is green, with any accepted risks explicitly documented.

---

## Recommended Execution Order

1. Phase 0: tracker, inventory, threat model.
2. Phase 1A and 1B: workspace authorization and Developer API/MCP security.
3. Phase 2A and 2B: request IDs, logs, scheduler/webhook reliability.
4. Phase 4: AI Assistant confirmed write actions, because it is the next product-critical power layer.
5. Phase 5: scheduled publishing automation due-run hardening.
6. Phase 3: retention/media/cost controls before paid plans.
7. Phase 6: Meta review prep once automation surfaces are stable.
8. Phase 7: real trend providers once cost/legal/provider choice is confirmed.
9. Phase 8: payments and entitlements.
10. Phase 9: final launch readiness.

## Current Vault Notes Mapped to Phases

| Vault note | Phase |
| --- | --- |
| `vm_unQXY4rKc8wKqnhF` database retention cleanup | Phase 3 |
| `vm_L6qEurMvvuXXu6fs` media storage limits and cleanup | Phase 3 |
| `vm_uP7PUpsuJ7Nm7khc` Stage 9B scheduled publishing runner | Phase 5 |
| `vm_6aUkXGCcypOXQozW` Developer API OAuth hardening | Phase 1 |
| `vm_p51HH5p3jBUk0bxH` reliability pass for API/backend | Phase 2 |
| `vm_JrBj09wmcXm4K4pm` Content Intelligence Phase 4 providers | Phase 7 |
| `vm_oo8HvSoXVOtS-QsP` Meta permission audit | Phase 6 |
| `vm_Zu9F3ly9C2jg0KQA` Developer API paid-plan decision | Phase 8 |
| `vm_Iso8OUM913XTydT8` AI Assistant command center direction | Phase 4 |
| `vm_JS3nqNFNQ4KXajNN` AI Assistant context plan | Phase 4 |

## First Implementation Plan to Write Next

Start with:

`docs/superpowers/plans/2026-05-16-security-inventory-and-access-hardening.md`

That plan should implement Phase 0 plus Phase 1A/1B first, because those give us the safety foundation for every later write-capable feature.
