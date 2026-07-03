# Task 2: Supabase Edge & Database Hardening (2026-07-02) — DONE

Handoff: vc_handoff_1958b78e-aa40-4b6f-8684-2e30dcefa341
- [x] Internal guards on no-JWT workers: automation-worker-condition/-private-reply/-reply-comment + process-automations (assertInternalInvoke); process-scheduled-executions consolidated onto shared helper
- [x] Membership guard for service-role user functions: new _shared/workspace-auth.ts (assertWorkspaceAccess) added to 11 functions (generate-*, chat-assistant, research-topic, sync-*)
- [x] Atomic claims for scheduled executions: migration 20260702100000 (claim_due_scheduled_executions) + runner rewrite with token-guarded finalize
- [x] Publishing claim-locking migration 20260701210000 applied (pair already in repo/deployed)
- [x] Advisor remediation migration 20260702110000: search_path pinned (6), trigger-fn REST execute revoked (2), 20 FK indexes, dropped duplicate constraint
- [x] Deferred (documented): 180 multiple_permissive + 70 initplan RLS perf, public bucket listing, pg_net, leaked-password toggle, is_member_of (RLS)
- [x] Applied 3 migrations; deployed 17 functions with correct verify_jwt split
- [x] Verify: migration list in sync; db lint clean; advisors 307→296 (all targeted security warns fixed); vitest 223/223; next build compiles

---

# P1 follow-up: fallback-workspace write side effects (2026-07-02)

Handoff: vc_handoff_a030480b-0d9d-4f54-a6f2-b2a01c36b3a0 — DONE
- [x] messages GET: mark-read writes gated on explicit workspace; workspace_id filters added to messages + conversations updates
- [x] settings.ts: togglePageSelection / updateCurrentWorkspaceSettings / removeCurrentWorkspaceProviderKey → getExplicitActiveWorkspace (throw on missing); read helpers unchanged
- [x] Tests: 2 new strictness tests (vitest 222/222); lint: only pre-existing catch-any errors; build compiles

---

# Task 1: P0 Security Blockers (2026-07-02)

Handoff: vc_handoff_c25d9ab4-736c-413b-9f70-7c737b760b0f
Plan: docs/superpowers/plans/2026-07-02-meta-wave-production-readiness.md (Task 1)

- [ ] Scheduler cron auth: require CRON_SECRET in production, drop x-vercel-cron fallback (app/api/cron/scheduler/route.ts)
- [ ] Rate limiting fails closed on RPC error/missing row (lib/security/rate-limit.ts)
- [ ] Bounded raw-body reader helper + Instagram webhook body cap before signature verification
- [ ] Strict workspace resolver (no first-workspace fallback) + switch all mutation handlers to it
- [ ] Remove memberships[0] fallback in lib/assistant/auth.ts (assistant write paths)
- [ ] Harden app/api/ai/generate-ideas: auth, body cap, sanitization, workspace permission, rate limits, redacted errors
- [ ] Message send routes: body caps, rate limits, shared Meta send helper (app/api/messages, app/api/live-messages/send)
- [ ] Remove first-membership fallback in app/api/ai/generate-caption
- [ ] Focused vitest coverage (tests/security/)
- [ ] Inventory tracked credential/security-sensitive archive material (no deletions)
- [ ] Verify: npx vitest run, npm run build, npm run lint
- [ ] Save outcome to Vault, resolve handoff, route to QA handoff vc_handoff_d61f8049-9dae-437b-bc2a-4fcf23ffb857

## Review

All Task 1 items complete and verified.

**Changes**
- `app/api/cron/scheduler/route.ts` — requires `CRON_SECRET`; dropped spoofable `x-vercel-cron` fallback; fails closed in production when secret missing.
- `lib/security/rate-limit.ts` — `consumeRateLimit` now fails closed (deny + retry-after) on RPC error or missing row.
- `lib/security/phase1-validation.ts` — added `readRawBodyWithLimit()` + `RequestBodyTooLargeError` (bounded streaming read).
- `app/api/webhooks/instagram/route.ts` — caps body at 1 MiB before buffering/signature verification; returns 413 on overflow.
- `lib/workspace-utils.ts` — split into `getActiveWorkspace` (read, keeps first-workspace fallback) and `getExplicitActiveWorkspace` (strict, cookie-only, no fallback).
- 26 mutation route handlers switched to `getExplicitActiveWorkspace()` (codemod, mutation methods only).
- `lib/assistant/auth.ts` — rejects missing (400) / unauthorized (403) workspace selection instead of first-membership fallback.
- `app/api/ai/generate-ideas/route.ts` — rewritten: auth, body cap, platform sanitization, strict workspace + `content:write` permission, user+IP rate limits, redacted errors.
- `app/api/ai/generate-caption/route.ts` — removed first-membership fallback (403 on non-member).
- `lib/meta-messaging.ts` — shared `sendMetaTextMessage()` + `requiredMessagingPermissions()` + `MAX_OUTBOUND_MESSAGE_LENGTH`; both message-send routes now use it with body caps, length caps, and rate limits.
- `docs/security/credential-archive-inventory-2026-07-02.md` — inventory (no deletions).

**Credential finding (CRITICAL, needs user action):** a complete signed Supabase `service_role` JWT for ref `txomrdymcawauezlprvn` is tracked in 3 archive `.py` files. Rotate keys; history purge deferred pending approval.

**Verification**
- `npx vitest run` → 220/220 passing (5 new/updated security tests).
- `next build` → Compiled successfully.
- `eslint .` → 280 problems (230 errors) vs baseline 281 (230 errors): zero new errors introduced; new files lint clean.
