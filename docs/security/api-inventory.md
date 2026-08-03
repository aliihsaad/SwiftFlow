# Security API Inventory

Status date: 2026-08-02
Generated from the active code under `app/api/**/route.ts`, `supabase/functions/**`, and `lib/developer-api/mcp.ts`. The Developer API surface is engagement-only: workspace, brand, automations, connected-account metadata, and analytics.

This is the Phase 0 inventory for authorization, capability, cost, and audit review. It is intentionally conservative: when a route uses helper-based auth or has incomplete direct auth signals, the entry calls out the Phase 1 check instead of assuming it is safe.

## Legend

Auth methods:

- `Supabase session`: route resolves the logged-in user through Supabase Auth.
- `Workspace permission`: route checks workspace membership/role through `requireWorkspacePermission` or an equivalent helper.
- `Developer API key`: route uses `withDeveloperApiAuth` and granular Developer API scopes.
- `OAuth connector token`: MCP/connector route accepts short-lived SwiftFlow OAuth tokens and maps them back to the backing Developer API key.
- `Meta webhook`: route verifies Meta challenge token or `X-Hub-Signature-256`.
- `Cron secret`: route requires `CRON_SECRET`, `x-vercel-cron`, or internal scheduler invocation.
- `Service role`: route/function uses Supabase service role internally; this is not a client auth method and requires extra review.
- `Public`: route is intentionally unauthenticated.
- `Public/needs review`: route appears callable without direct user auth and must be reviewed in Phase 1.

Capabilities:

- `R`: read-only
- `W`: write/update
- `D`: destructive delete/revoke
- `P`: publishes/sends to an external platform
- `M`: media/storage mutation
- `A`: automation execution/configuration
- `AI`: expensive AI/provider call
- `T`: token/secret handling
- `S`: scheduler/internal worker
- `AUDIT`: must produce audit/event log

## Next.js App Routes

| Route file | Methods | Auth classification | Capability | Phase 1 notes |
| --- | --- | --- | --- | --- |
| `app/api/ai/models/route.ts` | GET | Supabase session | R, T | Confirm provider key never leaks and settings access is role-gated |
| `app/api/ai/validate-key/route.ts` | POST | Supabase session + `settings:write` | T, AI | Ensure candidate key is never persisted by this route |
| `app/api/analytics/route.ts` | GET | Supabase session + active workspace; service role internally | R | Confirm all queries are workspace-filtered and analytics freshness behavior is bounded |
| `app/api/assistant/invoke/route.ts` | POST | Supabase session through `resolveAssistantWorkspace` helper | AI, R | Confirm function allowlist and per-user/per-IP rate limits |
| `app/api/auth/forgot-password/route.ts` | POST | Public auth flow | T | Rate-limit and CAPTCHA/email abuse controls |
| `app/api/auth/meta/callback/route.ts` | GET | Supabase session + workspace permission + service role | T, W | Meta token exchange, encryption, and workspace binding review |
| `app/api/auth/meta/login/route.ts` | GET | Supabase session + workspace permission | T | State/redirect validation review |
| `app/api/auth/meta/page-session/route.ts` | GET | Supabase session + workspace permission + service role | T, R | Confirm page session is workspace-scoped and token-safe |
| `app/api/auth/meta/select-page/route.ts` | POST | Supabase session + workspace permission + service role | T, W | Confirm selected Page/IG account ownership and token encryption |
| `app/api/auth/recovery-session/route.ts` | GET, DELETE | Public auth flow | T | Confirm recovery token cannot leak through logs/cache |
| `app/api/auth/resend-signup/route.ts` | POST | Public auth flow | T | Rate-limit and email abuse controls |
| `app/api/auth/sign-in/route.ts` | POST | Public auth flow | T | Rate-limit, lockout, and generic errors |
| `app/api/auth/sign-up/route.ts` | POST | Public auth flow | T, W | Rate-limit, email confirmation, bot controls |
| `app/api/auth/social/callback/route.ts` | GET | Public OAuth callback | T, W | State/redirect validation and provider error handling |
| `app/api/auth/social/connect/[platform]/route.ts` | GET | Public OAuth start | T | Validate platform allowlist and state |
| `app/api/automations/[id]/route.ts` | GET, PUT, DELETE | Supabase session + workspace permission | R, W, D, A, AUDIT | Add audit log for update/delete and destructive confirmation semantics |
| `app/api/automations/[id]/toggle/route.ts` | POST | Supabase session + workspace permission | W, A, AUDIT | Add audit log and idempotency behavior |
| `app/api/automations/instagram-accounts/route.ts` | GET | Supabase session | R | Confirm workspace permission and token redaction |
| `app/api/automations/instagram-media/route.ts` | GET | Supabase session | R, Meta | Confirm workspace permission and Meta rate/error handling |
| `app/api/automations/media/route.ts` | GET | Supabase session | R, Meta | Confirm workspace permission and account ownership |
| `app/api/automations/process/route.ts` | POST | Supabase session + workspace permission | S, A, P, AUDIT | Confirm this is not publicly triggerable for arbitrary runs |
| `app/api/automations/route.ts` | GET, POST | Supabase session + workspace permission | R, W, A, AUDIT | Ensure create validates graph/templates and social account ownership |
| `app/api/automations/social-accounts/route.ts` | GET | Supabase session | R | Confirm explicit workspace permission and token redaction |
| `app/api/automations/validate/route.ts` | POST | Public/needs review | R | No side effects, but should have size/rate limits due graph payload parsing |
| `app/api/brand/social-accounts/route.ts` | DELETE | Supabase session + workspace permission + service role | D, T, AUDIT | Add confirmation/audit and ensure account belongs to workspace |
| `app/api/brand/social-status/route.ts` | GET | Supabase session + workspace permission | R | Good candidate for BOLA tests |
| `app/api/brand-profile/assets/route.ts` | POST | Supabase session + workspace permission + service role | M, W, AUDIT | Validate MIME/size and storage path isolation |
| `app/api/brand-profile/route.ts` | GET, PUT | Supabase session + workspace permission | R, W, AUDIT | Field-level authorization and partial update tests |
| `app/api/content-intelligence/analytics-insights/route.ts` | GET | Supabase session | R, AI | Confirm workspace permission, cache bounds, and stale-source labels |
| `app/api/content-intelligence/trend-report/route.ts` | POST | Supabase session | AI, external provider candidate | Must research provider rules before Phase 7 |
| `app/api/cron/scheduler/route.ts` | GET, POST | Cron secret or Vercel cron header; dev-only fallback | S, P, AI, AUDIT | Require `CRON_SECRET` in production and add idempotency metrics |
| `app/api/developer/access-model/route.ts` | GET, POST | Supabase session + owner/admin check for POST | R, T | GET exposes scope options; POST validates access model |
| `app/api/developer/audit-logs/route.ts` | GET | Supabase session + owner/admin + service role | R, AUDIT | Good Phase 1 owner/admin authorization test |
| `app/api/developer/keys/[id]/route.ts` | PATCH, DELETE | Supabase session + owner/admin + service role | W, D, T, AUDIT | Revoke/delete confirmation and audit required |
| `app/api/developer/keys/route.ts` | GET, POST | Supabase session + owner/admin + service role | R, W, T, AUDIT | One-time secret display; paid gate prepared but not locked |
| `app/api/developer/mcp/route.ts` | GET, POST, OPTIONS | OAuth connector token or Developer API bearer token | MCP bridge | Ensure token audience binding, no token pass-through, no raw arbitrary route calls |
| `app/api/developer/oauth/authorize/route.ts` | GET, POST | OAuth authorization flow; user supplies Developer API key | T | State/resource validation, auth-code TTL, secure errors |
| `app/api/developer/oauth/register/route.ts` | POST | Public dynamic client registration | T | Rate-limit and validate redirect/client metadata |
| `app/api/developer/oauth/token/route.ts` | POST | OAuth token endpoint | T | Refresh rotation, backing key validation, revocation propagation |
| `app/api/developer/openapi.json/route.ts` | GET | Developer API docs endpoint | R | Decide whether public docs stay available before paid gates |
| `app/api/developer/v1/analytics/summary/route.ts` | GET | Developer API key, `analytics:read`, service role | R, Meta, AUDIT | Read-through sync is expensive; keep rate limit/freshness labels |
| `app/api/developer/v1/automation-media/route.ts` | GET | Developer API key, `automations:read`, service role | R, Meta | Account ownership and provider error tests |
| `app/api/developer/v1/automation-node-catalog/route.ts` | GET | Developer API key, `automations:read` | R | Safe schema-only endpoint |
| `app/api/developer/v1/automations/[id]/route.ts` | GET, PATCH, DELETE | Developer API key, `automations:read/update/delete`, service role | R, W, D, A, AUDIT | Strong BOLA, graph validation, destructive audit |
| `app/api/developer/v1/automations/[id]/toggle/route.ts` | POST | Developer API key, `automations:toggle`, service role | W, A, AUDIT | Idempotency and audit test |
| `app/api/developer/v1/automations/route.ts` | GET, POST | Developer API key, `automations:read/create`, service role | R, W, A, AUDIT | Template path preferred; raw graph escape hatch is high risk |
| `app/api/developer/v1/automation-templates/route.ts` | GET | Developer API key, `automations:read` | R | Template metadata must not expose tokens |
| `app/api/developer/v1/brand-profile/route.ts` | GET, PUT, PATCH | Developer API key, `brand:read/write`, service role | R, W, AUDIT | Field-level partial update tests |
| `app/api/developer/v1/social-accounts/route.ts` | GET | Developer API key, `automations:read`, service role | R, T | Return only safe IDs/metadata, never access tokens |
| `app/api/developer/v1/workspace/route.ts` | GET | Developer API key, `workspace:read`, service role | R | Used to validate backing API key during OAuth refresh |
| `app/api/external-services/[id]/route.ts` | PUT, DELETE | Supabase session + `settings:write` + service role | W, D, T, AUDIT | External API key storage and delete audit |
| `app/api/external-services/route.ts` | GET, POST | Supabase session + workspace permission + service role | R, W, T, AUDIT | Secret validation and redaction |
| `app/api/live-messages/route.ts` | GET | Supabase session | R | Confirm workspace permission and token redaction |
| `app/api/live-messages/send/route.ts` | POST | Supabase session + workspace permission | P, W, AUDIT | Meta messaging permissions, 24h window, and app-review constraints |
| `app/api/messages/route.ts` | GET, POST | Supabase session + workspace permission | R, P, W, AUDIT | DM send/read BOLA and Meta permission tests |
| `app/api/posts-media/comments/route.ts` | GET, POST, DELETE, PATCH | Supabase session + workspace permission | R, P, W, D, AUDIT | Comment/private reply Meta permission and object ownership |
| `app/api/posts-media/route.ts` | GET, PATCH, DELETE | Supabase session + workspace permission + service role | R, W, D, M, AUDIT | External post/media sync and destructive handling |
| `app/api/sync-analytics/route.ts` | POST | Supabase session + workspace permission + service role | S, R, Meta, AUDIT | Rate-limit; may call Meta and mutate analytics cache |
| `app/api/test-db/route.ts` | GET | Public disabled stub returning 404 | R | Remove before launch if route is not needed |
| `app/api/webhooks/instagram/route.ts` | GET, POST | Meta challenge token and `X-Hub-Signature-256`, service role | S, A, P, T | Replay/idempotency and logging redaction |
| `app/api/workspace/settings/route.ts` | GET, PUT | Supabase session + workspace permission + service role | R, W, T, AUDIT | Field-level secret handling for AI keys/settings |

## Supabase Edge Functions

| Function | Auth / invocation model | Capability | Phase 1/2 notes |
| --- | --- | --- | --- |
| `_shared` | Shared helper modules, not a deployed endpoint | T, Meta, email, provider helpers | Keep secret redaction and Meta token helpers centralized |
| `automation-orchestrator` | Internal/webhook invocation, service role | S, A, W | Must not accept arbitrary public runs without signed/internal caller |
| `automation-worker-ai-response` | Internal worker, no-verify-jwt deployment requirement | AI, A | Cost/rate limit and workspace filter |
| `automation-worker-condition` | Internal worker, no-verify-jwt deployment requirement | A | Validate input shape and node run context |
| `automation-worker-http-request` | Internal worker, no-verify-jwt deployment requirement | A, external call | High SSRF risk; currently temp disabled in validator, keep disabled until reviewed |
| `automation-worker-private-reply` | Internal worker; receives Meta token from orchestrator context | P, Meta | Token handling, Meta permission, and response audit |
| `automation-worker-reply-comment` | Internal worker; receives Meta token from orchestrator context | P, Meta | Comment ID validation and retry behavior |
| `automation-worker-run` | Internal graph runner, service role | S, A, P, AI, email | Core worker needs idempotency, node audit, and dead-letter handling |
| `automation-worker-send-dm` | Internal worker; receives Meta token from orchestrator context | P, Meta | 24h messaging window and app-review limitations |
| `automation-worker-send-email` | Internal worker, checks service-role key header | P, email | Email templates now include context; add rate/cost controls |
| `chat-assistant` | Invoked by authenticated Next.js assistant route | AI | Keep direct public calls disabled or JWT-protected |
| `generate-caption` | Invoked by authenticated app route | AI | Rate/cost control, model timeout |
| `generate-carousel` | Invoked by authenticated app route | AI | Cost limits and output validation |
| `generate-ideas` | Invoked by authenticated app route | AI | Cost limits and prompt safety |
| `generate-image` | Invoked by authenticated app/developer routes | AI, M | Storage quota, MIME validation, model fallback |
| `generate-message-reply` | Internal/app invocation | AI, Meta context | Avoid logging message PII |
| `generate-reply` | Internal/app invocation | AI, Meta context | Avoid logging comment PII |
| `process-automations` | Internal/webhook processor, service role | S, A, P, Meta | Idempotency, replay protection, and permission-state logging |
| `process-publishing-automations` | Scheduler target, service role key check | S, AI, M, W | Due-run locks, duplicate prevention, run history |
| `process-scheduled-executions` | Scheduler/worker target, service role key check | S, A | Delay node resume idempotency |
| `process-scheduled-posts` | Scheduler/app target, service role key check | S, P, Meta | Duplicate publish prevention and Meta error normalization |
| `research-topic` | Invoked by app/assistant content research | AI, external provider candidate | Phase 7 provider/legal/cost review |
| `scheduler-tick` | Supabase cron target | S | Single minutely hub; monitor drift and failures |
| `search-unsplash` | Provider lookup | R, external provider | Check API key handling, cache, rate limits |
| `select-unsplash-image` | Provider/media selection | R, external provider | Check image URL safety before use |
| `sync-analytics` | App/developer/scheduler-triggered sync | S, R, Meta, W | Read-through freshness, provider limits, no dashboard dependency |
| `sync-comments` | App/scheduler-triggered sync | S, R, Meta, W | Meta permission and PII retention |
| `sync-messages` | App/scheduler-triggered sync | S, R, Meta, W | Meta permission and PII retention |

## MCP Tool Inventory

All tools are exposed by `lib/developer-api/mcp.ts` through `/api/developer/mcp`. MCP transport accepts OAuth connector tokens or direct Developer API bearer tokens. Tool calls map to `/api/developer/v1/*` endpoints, so the REST endpoint scope checks remain authoritative.

| MCP tool | REST mapping | Required scope(s) | Capability | Notes |
| --- | --- | --- | --- | --- |
| `swiftflow_get_workspace` | `GET /workspace` | `workspace:read` | R | Safe metadata read |
| `swiftflow_get_brand_profile` | `GET /brand-profile` | `brand:read` | R | Workspace-scoped |
| `swiftflow_update_brand_profile` | `PATCH /brand-profile` | `brand:write` | W, AUDIT | Partial update should preserve omitted fields |
| `swiftflow_list_automations` | `GET /automations` | `automations:read` | R | Workspace-scoped |
| `swiftflow_list_social_accounts` | `GET /social-accounts` | `automations:read` | R, T | Must not return tokens |
| `swiftflow_list_automation_media` | `GET /automation-media` | `automations:read` | R, Meta | Uses account ID from social accounts |
| `swiftflow_list_automation_templates` | `GET /automation-templates` | `automations:read` | R | Preferred creation path |
| `swiftflow_get_automation_node_catalog` | `GET /automation-node-catalog` | `automations:read` | R | Exposes supported graph shape |
| `swiftflow_get_automation` | `GET /automations/{id}` | `automations:read` | R | BOLA test required |
| `swiftflow_create_automation_from_template` | `POST /automations` | `automations:create` | W, A, AUDIT | Stable path for connectors |
| `swiftflow_create_automation` | `POST /automations` | `automations:create` | W, A, AUDIT | Advanced raw graph path, higher validation risk |
| `swiftflow_update_automation` | `PATCH /automations/{id}` | `automations:update` | W, A, AUDIT | Wizard/legacy mode rejected through MCP |
| `swiftflow_toggle_automation` | `POST /automations/{id}/toggle` | `automations:toggle` | W, A, AUDIT | Idempotent active-state mutation |
| `swiftflow_delete_automation` | `DELETE /automations/{id}` | `automations:delete` | D, A, AUDIT | Confirmation required in clients |
| `swiftflow_get_analytics_summary` | `GET /analytics/summary` | `analytics:read` | R, Meta sync | Refreshes stale analytics when possible |

## Known Unknowns

- Whether all non-developer user routes consistently use `requireWorkspacePermission`, not only active workspace cookies.
- Whether all service-role reads include workspace filters and never trust client-provided workspace IDs alone.
- Whether all Edge Functions deployed with `--no-verify-jwt` have their own internal auth or are only reachable through trusted invocation paths.
- Whether Developer API audit logs cover every write/destructive/MCP tool path.
- Whether OAuth connector token storage should move from encrypted self-contained tokens to opaque DB-backed sessions before paid/public rollout.
- Whether media uploads need malware scanning or image validation beyond MIME/size before public launch.
- Whether current Meta webhook event processing has complete replay/idempotency coverage for comments, DMs, story replies, and scheduled publishes.
