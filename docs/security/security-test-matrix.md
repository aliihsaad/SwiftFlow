# Security Test Matrix

Status date: 2026-05-17

This matrix defines the tests required before the app can be considered production-hardened. It is not limited to unit tests; some items require integration, Edge Function, deployment, or manual production smoke tests.

## Test Levels

- `Unit`: local validation, helper, schema, and permission logic.
- `Integration`: route/function with Supabase test data or mocked providers.
- `E2E`: user or connector workflow through the app.
- `Load`: burst or sustained load against non-production environment.
- `Manual`: dashboard/provider checklist that cannot be reliably automated yet.

## Cross-Cutting Required Tests

| Area | Test | Level | Phase | Pass condition |
| --- | --- | --- | --- | --- |
| Workspace BOLA | Use object IDs from workspace B while authenticated in workspace A | Integration | 1 | Every read/write/delete returns 403 or 404 |
| Role authorization | Viewer/editor/admin/owner attempts for each protected action | Integration | 1 | Only allowed roles succeed |
| Property-level auth | Send forbidden fields like `workspace_id`, `created_by`, token fields, status escalation | Unit/Integration | 1 | Forbidden fields are ignored or rejected |
| Service-role usage | Route/function using service role must include workspace filter | Review/Integration | 1 | No service-role query trusts client workspace IDs alone |
| Rate limits | Repeated expensive calls per user, IP, workspace, and API key | Integration/Load | 1/2 | 429 with retry guidance before provider exhaustion |
| Audit logs | Write/destructive/provider-send actions create audit/run records | Integration | 1/2 | Audit row includes actor, workspace, target, action, request ID |
| Request IDs | User-visible request IDs trace through Next.js, MCP, Edge Functions, provider calls | Integration | 2 | One ID can follow the full failure path |
| Log redaction | API keys, OAuth tokens, Meta tokens, AI provider keys never appear in logs/responses | Unit/Integration | 1/2 | Secret-like values are redacted |
| Idempotency | Retry webhooks/scheduler jobs/tool calls | Integration | 2 | No duplicate replies, DMs, emails, or automation runs |

## Object and Endpoint Groups

| Object / route group | Critical endpoints | Required tests |
| --- | --- | --- |
| Auth | `/api/auth/sign-in`, `/api/auth/sign-up`, `/api/auth/forgot-password`, `/api/auth/resend-signup`, recovery routes | Rate limits, generic errors, email abuse controls, redirect/state safety |
| Meta OAuth | `/api/auth/meta/login`, `/callback`, `/select-page`, `/page-session` | State validation, workspace binding, token encryption, account ownership |
| Brand profile | `/api/brand-profile`, `/api/developer/v1/brand-profile` | Read/write role checks, partial update preserves omitted fields, forbidden field rejection |
| Workspace settings | `/api/workspace/settings` | `settings:write` required, AI provider secrets encrypted/redacted, field allowlist |
| Synced media and comments | `/api/posts-media`, `/api/posts-media/comments` | Workspace ownership, comment/reply permissions, provider failures, BOLA |
| Comments/messages | `/api/posts-media/comments`, `/api/messages`, `/api/live-messages/send` | Meta permission handling, 24h messaging window, account role/test behavior, audit |
| Analytics | `/api/analytics`, `/api/sync-analytics`, `/api/developer/v1/analytics/summary` | Read-through sync, stale cache labels, Meta failures, rate limits |
| Content Intelligence | `/api/content-intelligence/**`, Developer analyze-post | Provider timeout/fallback, evidence labels, cache, per-plan quota later |
| Dashboard automations | `/api/automations/**` | Graph validation, social account ownership, template compatibility, toggle/delete audit |
| Developer automations | `/api/developer/v1/automations/**`, MCP automation tools | Scope denial, BOLA, template-first creation, raw graph rejection for invalid configs |
| Scheduler | `/api/cron/scheduler`, `scheduler-tick` | Secret required in production, job failure isolation, 207 behavior, no duplicate work |
| Webhooks | `/api/webhooks/instagram`, future Stripe webhook | Signature validation, replay/idempotency, malformed payloads, safe logging |
| Developer API keys | `/api/developer/keys`, `/keys/[id]`, `/audit-logs`, `/access-model` | Owner/admin only, one-time secret display, revoke/delete, scope edit, audit logs |
| MCP OAuth | `/api/developer/oauth/**`, `/api/developer/mcp` | Dynamic client registration limits, auth code TTL, access expiry, refresh rotation, backing key revocation |
| AI Assistant | `/api/assistant/command`, `/invoke`, future write actions | Function allowlist, context scoping, proposal-only before confirmation, mobile-safe cards |
| External services | `/api/external-services/**` | Settings role check, secret redaction, delete confirmation, provider key validation |

## Developer API Scope Matrix

| Scope | Endpoints/tools | Negative tests |
| --- | --- | --- |
| `workspace:read` | `GET /workspace`, `swiftflow_get_workspace` | Missing scope cannot access workspace metadata |
| `brand:read` | `GET /brand-profile`, `swiftflow_get_brand_profile` | Read scope cannot update |
| `brand:write` | `PUT/PATCH /brand-profile`, `swiftflow_update_brand_profile` | Cannot write forbidden fields or another workspace |
| `automations:read` | List/get/templates/catalog/social accounts/media | No tokens returned; cross-workspace automation fails |
| `automations:create` | Create automation/template | Invalid raw graph rejected; template input validated |
| `automations:update` | Update automation | Invalid graph rejected; social account ownership checked |
| `automations:toggle` | Toggle active state | Idempotent, scoped, audited |
| `automations:delete` | Delete automation | Destructive confirmation/audit, cross-workspace denied |
| `analytics:read` | Analytics summary | No writes beyond bounded stale sync; rate limited |

## Edge Function Matrix

| Function group | Functions | Required tests |
| --- | --- | --- |
| AI generation | `generate-caption`, `generate-ideas`, `generate-carousel`, `generate-image`, `generate-reply`, `generate-message-reply`, `chat-assistant`, `research-topic` | Provider timeout, missing key, bad payload, rate/cost limits, workspace context |
| Analytics/sync | `sync-analytics`, `sync-comments`, `sync-messages` | Meta permission missing, stale cache, partial failures, PII/log redaction |
| Automation core | `process-automations`, `automation-orchestrator`, `automation-worker-run`, `process-scheduled-executions` | Replay/idempotency, graph traversal, failed node handling, dead-letter |
| Automation actions | `automation-worker-ai-response`, `automation-worker-condition`, `automation-worker-private-reply`, `automation-worker-reply-comment`, `automation-worker-send-dm`, `automation-worker-send-email` | Node config validation, Meta/send/email failure, audit/node run state |
| External/media helper | `search-unsplash`, `select-unsplash-image` | Provider error, URL safety, rate limit, no unexpected storage mutation |
| Scheduler | `scheduler-tick` | One tick resumes delayed automation executions once and preserves idempotency |

## Manual Production Readiness Checks

| Check | Phase | Evidence required |
| --- | --- | --- |
| Supabase Security Advisor reviewed | 1 | Screenshot/exported findings and resolution notes |
| RLS enabled on user-facing tables | 1 | Table list with policy status |
| Vercel production checklist reviewed | 2/9 | CSP/headers, WAF/rate limits, observability/log drains, function regions/durations |
| Meta app-review permission matrix | 6 | Permission-by-feature table and reviewer script |
| Stripe webhook signature test | 8 | Stripe CLI or dashboard test evidence |
| Full production smoke test | 9 | Login, connected accounts, automation, webhook, replies, inbox, Developer API, connector, analytics |

## Coverage Verification Commands

Run these before closing Phase 0 or after adding/removing routes:

```powershell
Get-ChildItem -Path app\api -Recurse -Filter route.ts | ForEach-Object { $_.FullName.Substring((Get-Location).Path.Length + 1) } | Sort-Object
Get-ChildItem -Path supabase\functions -Directory | ForEach-Object { $_.Name } | Sort-Object
rg -n "swiftflow_" lib\developer-api\mcp.ts
```

Each listed route, function, and MCP tool must appear in `docs/security/api-inventory.md`.
