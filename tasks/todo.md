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

---

# Provider-neutral webhook ingress (2026-07-26) — DONE

Branch: `swiftflow-v2-transformation`. Vault handoff: `vm_cU2DGpqNzjUhHfVq`.
Detail: `docs/transformation/provider-neutral-webhook-ingress.md`.

Transformation roadmap step: "provider-neutral Meta webhook ingress with a separate insert-only PostgreSQL role".

- [x] `swiftflow_webhook_ingress` NOLOGIN role: column-level INSERT on 7 columns, no select/update/delete/claim, no account/automation/workspace access, plus an independent RLS insert policy pinning the unclaimed initial row state.
- [x] `lib/webhooks/postgres-inbox-store.ts` — chunked multi-row append. No `returning` and no `on conflict` target, because both require SELECT; inserted counts come from the insert command tag.
- [x] `lib/webhooks/ingress-runtime.ts` + `workers/webhook-ingress.ts` — signature verified before parsing, body capped while streaming, 503 (not 200) when the inbox write fails so Meta re-delivers.
- [x] Staging wiring: ingress login script, append-only verifier, compose service (still no host ports, network stays internal), deployment smoke, env example, npm scripts.
- [x] Docs: new ingress doc; staging activation gate and roadmap slice status updated.

**Verification**
- `npm run test:ci` → 430/430 across 82 files (34 new unit + 13 new security tests).
- `npm run test:postgres` → 21/21 against real PostgreSQL 15; `verify-webhook-comparison-role.sql` and `verify-webhook-ingress-role.sql` both report verified logins.
- Service entry points run against the test database: healthcheck exit 0; smoke reported `firstInserted=1 / replayInserted=0 / replayDuplicates=1`; `verify-ingress-result.sql` confirmed one row in `pending` with `attempt_count 0`.
- `npm run lint` → unchanged from the recorded 214-error/49-warning baseline; new files contribute none.

**Still gated (deliberate):** no host port, no reverse proxy, Meta secrets are generated staging placeholders, `WEBHOOK_INBOX_SHADOW_ENABLED` unset everywhere, comparison worker still side-effect-free.

**Follow-up — deploy script now converges an existing installation.** Two defects found by checking the slice against the already-deployed host state:
- [x] Secrets were only generated when `.env.worker.staging` was absent, so a pre-ingress deployment would abort on the compose `:?` guards. Now appends only missing variables; existing values are never read, reprinted, or rotated, only names are echoed, and a missing trailing newline is repaired first.
- [x] `docker-entrypoint-initdb.d` runs only on an empty data directory, so an existing database would never gain the ingress role and the ingress healthcheck would fail. Now starts PostgreSQL first and alone, applies the inbox schema + both capability roles + both logins explicitly (all idempotent; base schema and smoke seed excluded), then starts the rest.
- [x] Upgrade rehearsal on a disposable copy: pre-ingress env file → exactly 3 variables added, 4 existing values byte-identical, all services healthy. Database rolled back by dropping the policy and both ingress roles → re-run recreated them, ingress passed its startup assertion and reached healthy, both verifiers passed, dedup held (`firstInserted=0/firstDuplicates=1`), and the comparison worker consumed the ingested row to a terminal `ignored` state with no side effect.

---

# HTTPS ingress exposure (2026-07-26) — DONE

Deployed on the Hostinger VPS srv1347979. Vault handoff: `vm_Xl-FhAeJDFifyZ6s`. Plan `vm_JnSqrWb7WqK3NkY6` resolved.

Public endpoint: `https://webhooks.social.swiftdigital-s.com/webhooks/meta`, Caddy v2.11.4 (host systemd), Let's Encrypt cert valid to 2026-10-24.

- [x] **Docker will not publish ports for a container on an `internal: true` network** — it accepts the request (`HostConfig.PortBindings` populated) but `NetworkSettings.Ports` stays empty and no listener is created, silently, on 29.3.0. The approved `127.0.0.1:8081` mechanism was therefore impossible; documented rollback ran immediately.
- [x] Fallback (user-approved): pinned IPAM subnet `172.22.0.0/16` + static `ipv4_address: 172.22.0.10`. Stricter than planned — zero host bindings anywhere and no egress for the ingress. Caddy reaches it over the bridge.
- [x] Network recreation via project-scoped `down`/`up`, never `--volumes`. Data digest identical before and after (`22903e2e…`); volume kept its original timestamp.
- [x] Caddy: one appended `import /etc/caddy/conf.d/*.caddy` line (47→49); all SwiftFlow config isolated in `conf.d/swiftflow-webhooks.caddy`; only `/webhooks/meta` proxied, everything else 404. Validated before reload; reloaded not restarted (PID unchanged).
- [x] Security tests rewritten around `tests/security/helpers/compose-ports.ts` — assert zero published ports, no routable binding, pinned address and subnet. Mutation-tested: `0.0.0.0` binding fails 1 test, publishing PostgreSQL fails 2.

**Verification** — external: unsigned POST 401, bogus signature 401, `/healthz` 404, `/` 404, `/admin` 404, traversal 404; `153.92.221.146:8080/:8081/:5432` and `172.22.0.10:8080` all unreachable. Server-side: valid verify-token GET 200 with exact challenge echo, wrong token 403. All three services healthy; four unrelated Caddy sites still 200. Suite 434/434; repo and host compose byte-identical.

**Still gated:** no Meta callback configured, Meta secrets are generated staging placeholders, `WEBHOOK_INBOX_SHADOW_ENABLED` unset, comparison worker side-effect-free.
