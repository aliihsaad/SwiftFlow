# Meta Wave Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Social Media Manager AI Tool production-ready for the next Meta permission-wave submission while closing security, billing, retention, workspace, and operational risks found in the July 2, 2026 audit.

**Architecture:** Treat this as a gated release program. First remove externally exploitable security and deployment blockers, then add workspace billing/entitlement and retention foundations, then verify the narrow Meta review path with production-like accounts and logs.

**Tech Stack:** Next.js App Router, Supabase Postgres/Auth/Storage/Edge Functions/CLI, Stripe Billing + Checkout Sessions + Customer Portal, Meta Graph API, Vercel, Vitest/Playwright, Vault Collab.

---

## Coordinator Inputs

- Supabase CLI audit memory: `vm_8c3SdP61L4NW8jnT`
- Supabase backend audit memory: `vm_4-Pz6V5XAS51MrBR`
- Next.js backend/API audit memory: `vm_gfa2IewEkcDn9wKM`
- Payments and entitlements audit memory: `vm_o1D40ZcaKUndvUJO`
- Retention and cleanup audit memory: `vm_0eAQ55-TgQTPAaWw`
- Open-loop resolver report: `vm_ZS8btqQs5rGPoYin`
- Scheduler locking implementation memory: `vm_kJhDbW4xFrgKsKm8`

## Program Rules

- [ ] Use Vault Collab for every implementer, explorer, reviewer, and QA handoff.
- [ ] Every Fable 5 implementer must claim the published handoff before editing.
- [ ] Use QA/reviewer checks whenever an implementation slice changes production code, schema, Edge Functions, auth, billing, retention, Meta integration, or shared utilities.
- [ ] QA must review code quality as well as behavior: senior-level simplicity, clear ownership boundaries, scalable data access, no unnecessary abstraction, no duplicated security logic, and no avoidable complexity.
- [ ] Do not close Vault open loops until the user confirms the proposed batch closures.
- [ ] Do not deploy database migrations without the matching Edge Function deployment when an RPC/function dependency exists.
- [ ] Do not broaden the Meta review demo scope beyond currently supportable Facebook/Instagram flows.
- [ ] Do not enable payment enforcement until billing webhooks, entitlement reads, downgrade grace, and tests pass.
- [ ] Do not delete user-visible data without export, legal-hold, and downgrade-grace policy.

## Implementation Waves

| Wave | Owner | Primary Risk | Exit Gate |
| --- | --- | --- | --- |
| 0. Release freeze and branch hygiene | Coordinator | Dirty worktree and unsequenced changes | Branch/worktree chosen, package manager chosen, unrelated changes isolated |
| 1. P0 security blockers | Fable 5 | Service-role abuse, spoofable cron, leaked credentials, fail-open limits | Security tests pass and no known public/service-role escalation remains |
| 2. Supabase database and Edge hardening | Fable 5 | Advisor findings, unguarded Edge functions, scheduler races | CLI advisors rerun, migration list clean, guarded functions deployed |
| 3. Billing, entitlements, retention | Fable 5 | No paid-plan source, no cleanup control plane | Stripe test-mode lifecycle updates workspace entitlements and cleanup dry-run reports |
| 4. Meta permission-wave readiness | Fable 5 + QA | Reviewer sees unsupported features or unstable flow | Screencast path and test account flow pass desktop/mobile Playwright checks |
| 5. Release verification | Reviewer + QA | Regression, lint/type/build drift, missing observability | Build/test/lint baseline known, smoke tests documented, rollback path ready |

---

## Task 0: Release Freeze and Baseline

**Files:**
- Read: `package.json`
- Read: `package-lock.json`
- Read: `pnpm-lock.yaml`
- Read: `.gitignore`
- Read: `docs/superpowers/plans/2026-05-16-critical-production-roadmap.md`
- Modify only if needed: `docs/production/critical-roadmap-tracker.md`

- [ ] **Step 1: Choose the implementation branch/worktree**

Run:

```bash
git status --short
git branch --show-current
```

Expected: identify unrelated user/archive changes before any implementation commit.

- [ ] **Step 2: Choose one package manager**

Run:

```bash
node -p "require('./package.json').packageManager || 'missing packageManager'"
```

Expected: decide whether `pnpm-lock.yaml` or `package-lock.json` is authoritative. The July 2 audit found lockfile drift around Next.js and Supabase packages.

- [ ] **Step 3: Record the release freeze**

Update `docs/production/critical-roadmap-tracker.md` with current branch, package manager, Supabase project ref `txomrdymcawauezlprvn`, and the July 2 audit memory UIDs above.

- [ ] **Step 4: Verify no accidental broad edits**

Run:

```bash
git diff --stat
```

Expected: only intentional docs/tracker changes for this task.

---

## Task 1: P0 Security Blockers

**Files:**
- Modify: `app/api/cron/scheduler/route.ts`
- Modify: `lib/security/rate-limit.ts`
- Modify: `app/api/webhooks/instagram/route.ts`
- Modify: `lib/workspace-utils.ts`
- Modify: `lib/assistant/auth.ts`
- Modify: `app/api/ai/generate-ideas/route.ts`
- Modify: `app/api/**/messages/**/route.ts`
- Create/modify: shared route helpers under `lib/`
- Review: `docs/archive/cleanup-review-2026-05-29/delete-candidates/security-sensitive/**`

- [ ] **Step 1: Make scheduler auth explicit**

Remove the production fail-open path that accepts `x-vercel-cron` when `CRON_SECRET` is unset. Production must reject scheduler calls unless `CRON_SECRET` is configured and matches.

- [ ] **Step 2: Make critical rate limiting fail closed**

For auth, Developer API, AI generation, and message-send paths, fail closed on RPC errors or missing rows. If an emergency fallback is needed, make it bounded and logged.

- [ ] **Step 3: Add request body limits before buffering**

Apply caps before reading unsigned webhook/upload/AI bodies. Instagram webhook signature verification must happen against a bounded body.

- [ ] **Step 4: Remove workspace fallback for mutations**

For mutation routes and assistant write paths, reject missing/invalid `active_workspace_id` instead of silently choosing the first workspace.

- [ ] **Step 5: Consolidate route primitives**

Create shared helpers for workspace auth, JSON error responses, route rate-limit enforcement, admin client creation, and Meta message sending. Keep each helper small and testable.

- [ ] **Step 6: Handle tracked credential material**

Do not purge history without explicit user approval. First inventory the archived security-sensitive files, rotate any real credentials found, and add secret scanning to CI or pre-commit.

- [ ] **Step 7: Verify**

Run:

```bash
npm run build
npm run lint
```

Expected: build passes. Lint may still expose pre-existing baseline debt; new files must not add avoidable lint errors.

---

## Task 2: Supabase Edge and Database Hardening

**Files:**
- Modify: `supabase/functions/_shared/internal-auth.ts`
- Modify: `supabase/functions/process-automations/index.ts`
- Modify: `supabase/functions/process-scheduled-executions/index.ts`
- Modify: `supabase/functions/automation-worker-condition/index.ts`
- Modify: `supabase/functions/automation-worker-private-reply/index.ts`
- Modify: `supabase/functions/automation-worker-reply-comment/index.ts`
- Modify: `supabase/functions/generate-caption/index.ts`
- Modify: `supabase/functions/generate-ideas/index.ts`
- Modify: `supabase/functions/generate-image/index.ts`
- Modify: `supabase/functions/chat-assistant/index.ts`
- Modify: `supabase/functions/research-topic/index.ts`
- Modify: `supabase/functions/sync-comments/index.ts`
- Modify: `supabase/functions/sync-messages/index.ts`
- Modify: `supabase/functions/sync-analytics/index.ts`
- Create/modify: `supabase/migrations/*.sql`

- [ ] **Step 1: Deploy scheduler locking dependency as a pair**

Apply `supabase/migrations/20260701210000_add_publishing_automation_claim_locking.sql` and redeploy `process-publishing-automations` in the same release window.

- [ ] **Step 2: Guard internal no-JWT functions**

Apply `assertInternalInvoke` or equivalent to all no-verify internal workers, including condition, private reply, and reply comment workers.

- [ ] **Step 3: Add membership checks to service-role user functions**

For user-facing Edge Functions that use service-role clients and caller-supplied `workspaceId`, verify the caller JWT and workspace membership before reading tokens or writing data.

- [ ] **Step 4: Add atomic claims for scheduled executions**

Implement claim/lease/idempotency for `process-scheduled-executions`, matching the publishing automation locking pattern where possible.

- [ ] **Step 5: Remediate Supabase advisor security findings**

Fix mutable function `search_path`, revoke anon/authenticated execute on security-definer helpers unless intentionally public, tighten public bucket listing policies, and move or document `pg_net` outside public if feasible.

- [ ] **Step 6: Remediate priority performance findings**

Consolidate duplicate permissive RLS policies, replace `auth.uid()` initplan hot spots with `(select auth.uid())`, add missing foreign-key indexes, and remove or justify duplicate/unused indexes.

- [ ] **Step 7: Verify with CLI**

Run:

```bash
supabase migration list --linked
supabase db lint --linked --schema public --level warning --fail-on none
supabase db advisors --linked --type all --level info --fail-on none
```

Expected: migration list is clean and security warnings are reduced or explicitly documented with rationale.

---

## Task 3: Billing, Entitlements, and Retention Control Plane

**Files:**
- Create: `lib/billing/stripe.ts`
- Create: `lib/billing/entitlements.ts`
- Create: `app/api/billing/checkout/route.ts`
- Create: `app/api/billing/portal/route.ts`
- Create: `app/api/billing/webhook/route.ts`
- Modify: `lib/developer-api/entitlements.ts`
- Create/modify: `supabase/migrations/*.sql`
- Create: `supabase/functions/retention-cleanup/index.ts`
- Modify: `supabase/functions/scheduler-tick/index.ts`
- Modify: `app/api/brand-profile/assets/route.ts`
- Modify: `components/create/media-upload-zone.tsx`
- Modify: `components/create/create-post-modal.tsx`
- Modify: `supabase/functions/generate-image/index.ts`
- Modify: `app/api/developer/v1/media/route.ts`
- Modify: `app/api/developer/v1/media/generate/route.ts`
- Create: billing and retention tests under `tests/`

- [ ] **Step 1: Add workspace billing schema**

Create `workspace_billing_customers`, `workspace_subscriptions`, expanded `workspace_entitlements`, `workspace_usage_counters`, and `stripe_webhook_events`. RLS should allow workspace members/admins to read only their workspace state and service-role-only writes from webhooks.

- [ ] **Step 2: Implement Stripe Billing routes**

Use Stripe Billing with Checkout Sessions in `mode: 'subscription'` and Customer Portal for self-service changes. The webhook route must use raw body signature verification and idempotent event inserts.

- [ ] **Step 3: Add enforcement flag**

Use `BILLING_ENFORCEMENT_MODE` so gates can be tested without unexpectedly breaking current beta/test flows.

- [ ] **Step 4: Add entitlement checks**

Gate Developer API, AI generation, scheduled publishing, automations, team seats, connected social accounts, media quota, generated asset quota, and deep trend reports from a single entitlement reader.

- [ ] **Step 5: Add retention policy schema**

Add tier-aware retention fields for logs, analytics, comments/messages, generated assets, post media, temp OAuth sessions, invites, API audit logs, downgrade grace, export state, cleanup pause, and legal hold.

- [ ] **Step 6: Track storage objects**

Create `workspace_storage_objects` with workspace, bucket, object path, source table/id, bytes, URL, delete status, and retry metadata. Update every upload path to record object metadata.

- [ ] **Step 7: Implement retention cleanup**

Create a service-role `retention-cleanup` Edge Function with internal auth, dry-run mode, advisory locking, small batches, legal-hold/export/downgrade checks, durable run summaries, and storage delete retries.

- [ ] **Step 8: Verify Stripe and cleanup**

Run:

```bash
npm run build
npm run lint
supabase db lint --linked --schema public --level warning --fail-on none
```

Expected: Stripe test-mode checkout, webhook, portal, cancel/downgrade, and cleanup dry-run can be demonstrated without enabling production enforcement.

---

## Task 4: Meta Permission-Wave Readiness

**Files:**
- Modify: `proxy.ts`
- Modify: `lib/meta-api-client.ts`
- Modify: Meta OAuth/API routes under `app/api/auth/meta/**`
- Modify: post publishing routes/actions under `app/api/posts/**` and `app/actions/**`
- Modify: `docs/app-review/scripts/meta-review-screencast-phase-1.md`
- Create/modify: Playwright review smoke tests under `tests/`

- [ ] **Step 1: Freeze the review scope**

Demo only the supported Phase 1 path: review mode, Meta connect, settings readiness, create Facebook + Instagram image post now, scheduled post, reconnect/disconnect if needed.

- [ ] **Step 2: Hide or label unsupported flows**

Do not demo comments, messages, analytics, publishing automations, or autonomous assistant write actions until their permissions, auth guards, and tests are complete.

- [ ] **Step 3: Fix review mode fail-open risk**

Review mode routing must fail closed and should not expose production-only behavior to Meta reviewers unintentionally.

- [ ] **Step 4: Align Graph API version**

Bring code and docs to the intended Meta Graph API version target, or explicitly document why a lower version remains in use for the submission.

- [ ] **Step 5: Add review smoke tests**

Cover Meta direct review URLs, OAuth callback/page selection, publish-now flow, scheduled post flow, reconnect/disconnect, and mobile navigation.

- [ ] **Step 6: Verify**

Run:

```bash
npm run build
npm run lint
```

Expected: the documented screencast path matches the actual UI and no unsupported feature is required for approval.

---

## Task 5: Release Verification and Loop Closure

**Files:**
- Modify: `docs/production/critical-roadmap-tracker.md`
- Modify: `docs/app-review/scripts/meta-review-screencast-phase-1.md`
- Read/update: Vault memory and Vault Collab handoffs

- [ ] **Step 1: Run release checks**

Run:

```bash
npm run build
npm run lint
supabase migration list --linked
supabase db advisors --linked --type all --level info --fail-on none
```

Expected: any remaining warnings are documented and assigned.

- [ ] **Step 2: Run reviewer flows**

Use Playwright and a real mobile viewport to verify dashboard navigation, assistant mobile layout, Meta review path, scheduling path, and billing settings visibility.

- [ ] **Step 3: Run senior code-quality review**

For each implementation slice, review the diff for unnecessary complexity, duplicated helpers, unsafe service-role boundaries, N+1/unbounded queries, missing workspace filters, missing idempotency, poor error handling, weak tests, and scalability bottlenecks. Reject changes that work locally but make the system harder to maintain or scale.

- [ ] **Step 4: Prepare deployment notes**

Document migration order, Edge Function deploy order, env vars, rollback steps, and post-deploy smoke tests.

- [ ] **Step 5: Close only confirmed loops**

Ask the user before closing the five assistant mobile loops, the LinkedIn n8n loop, and the loop-resolver meta-loop. Keep the nine production-readiness loops open until implementation and verification land.

## Current Default Next Step

Publish Fable 5 implementer handoffs for Tasks 1 through 4, plus a separate reviewer/QA handoff for Task 5. The first implementer should start with Task 1 security blockers unless the coordinator chooses to deploy the already-written scheduler locking migration/function pair first.
