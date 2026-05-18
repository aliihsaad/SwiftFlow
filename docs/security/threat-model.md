# Security Threat Model

Status date: 2026-05-17

Baseline references:

- OWASP API Security Top 10 2023: https://owasp.org/www-project-api-security/
- Supabase production checklist: https://supabase.com/docs/guides/deployment/going-into-prod
- Vercel production checklist: https://vercel.com/docs/production-checklist
- MCP authorization draft: https://modelcontextprotocol.io/specification/draft/basic/authorization
- OpenAI Actions production notes: https://developers.openai.com/api/docs/actions/production
- Stripe subscription webhooks: https://docs.stripe.com/billing/subscriptions/webhooks

## Scope

This model covers SwiftFlow production hardening for:

- Dashboard APIs.
- Developer API and MCP tools.
- Supabase Edge Functions.
- Meta webhooks and Graph API calls.
- AI provider calls and generated media.
- Scheduler and automation workers.
- Future Stripe entitlements.

## Core Assets

| Asset | Why it matters | Highest-risk actions |
| --- | --- | --- |
| Workspace data | Tenant isolation and business data | Cross-workspace reads/writes |
| Draft/scheduled/published posts | User-facing content and publishing rights | Publish now, schedule, delete |
| Media URLs and storage objects | Public files, storage cost, post assets | Upload, generate, append, cleanup |
| Social accounts and Meta tokens | External account control | Token leakage, unauthorized publish/send |
| Automations and workflow graphs | Automated public/customer interactions | Create/update/toggle/delete, worker execution |
| Developer API keys | Agent access to workspace operations | Scope bypass, stale revoked keys |
| OAuth connector tokens | ChatGPT/Claude/Codex access | Token replay, wrong audience, refresh abuse |
| Analytics and content intelligence | Decision data and provider cost | Stale data, unbounded sync/provider calls |
| AI Assistant proposals | Future write-capable agent actions | Silent mutation, confusing confirmations |
| Billing entitlements | Paid access and limits | Unpaid premium access or accidental lockout |

## Threats and Controls

| Threat | Applies to | Impact | Current control | Required hardening |
| --- | --- | --- | --- | --- |
| Broken Object Level Authorization | Posts, automations, media, chat sessions, Developer API object IDs | Tenant data leak or mutation | Many routes filter by `workspace_id`; Developer API uses workspace context | Add tests for every object ID route using another workspace's ID |
| Broken Authentication | Public auth routes, Developer API keys, OAuth tokens | Account/key/session takeover | Supabase Auth, HMAC API key hashes, OAuth token verification | Rate-limit auth endpoints, verify connector resource/audience, test revoked/expired paths |
| Broken Object Property Level Authorization | Brand profile, workspace settings, posts, automations | Protected fields changed through mass assignment | Some sanitizers and explicit update objects | Add allowlists and tests for forbidden fields like `workspace_id`, token fields, status transitions |
| Unrestricted Resource Consumption | AI image generation, content intelligence, analytics sync, media upload, email | Cost spike or outage | Some rate-limit helpers and Developer API rate limits | Per-user, per-workspace, per-key quotas; provider timeouts; storage size limits |
| Broken Function Level Authorization | Owner/admin Developer API management, settings, billing, destructive operations | Viewer/editor gains admin capability | `requireWorkspacePermission` and owner/admin checks in some routes | Inventory every route by role and test viewer/editor denial |
| Sensitive Business Flow Abuse | Publish now, send DM, reply comment, email, create automation | Spam, account restriction, user harm | Scopes and Meta permission helpers | Confirmation semantics, audit logs, rate limits, Meta policy checks |
| SSRF / unsafe URL handling | Media uploads, reference images, external HTTP node, future providers | Internal network access or malicious file handling | HTTP node disabled in validator; base64 upload path added | Keep HTTP node disabled until SSRF allowlist; validate URLs, MIME, byte size, and redirects |
| Security Misconfiguration | Vercel, Supabase, Edge Functions, secrets | Public internal worker or weak headers | Some internal service-role checks documented | Run Supabase Security Advisor, Vercel production checklist, verify no-verify-jwt functions have internal auth |
| Improper Inventory Management | Growing `app/api`, Edge Functions, MCP tools | Forgotten public/debug endpoints | This inventory | Add inventory coverage check to CI or release checklist |
| Unsafe Third-Party API Consumption | Meta, AI providers, Resend, Unsplash, Stripe, future trend providers | Bad data, provider outage, token/cost risk | Provider wrappers exist for some flows | Normalize errors, timeouts, retries, evidence labels, and provider-specific tests |
| Token Leakage | Meta tokens, API keys, OAuth tokens, AI provider keys | Account takeover and external API abuse | Encryption helpers and one-time key display | Log redaction tests, response schema tests, no token return from social-account endpoints |
| OAuth Session Drift | MCP connectors after API key revoke/expiry | Connector keeps access after owner revokes key | Refresh validates backing Developer API key | Consider DB-backed opaque connector sessions and central revocation before public paid launch |
| Webhook Replay | Meta webhooks, Stripe future webhooks | Duplicate DMs/comments/publish/email | Some stable event keys exist | Persist replay keys and idempotency for every webhook/worker action |
| Duplicate Scheduler Execution | Scheduled posts, delayed automation nodes, publishing automation runs | Duplicate public posts/messages/images | Central scheduler tick exists | DB locks/idempotency per run/post/platform and dead-letter handling |
| Destructive Action Abuse | Delete posts, automations, API keys, media, cleanup jobs | Data loss | Some delete endpoints scoped | Confirmation modals/API semantics, audit logs, soft delete where appropriate |
| Assistant Silent Mutation | Future AI Assistant write actions | User loses control or app changes unexpectedly | Current assistant mostly read/proposal | Phase 4 structured action cards, before/after diffs, explicit confirmation |
| Entitlement Bypass | Future paid Developer API/media/trends | Revenue loss or unfair resource use | Entitlement hook exists for Developer API preview | Phase 8 backend gates plus non-breaking beta override until payments are live |

## Provider-Specific Notes

Meta:

- Webhook POST must verify `X-Hub-Signature-256`.
- App-review/test-mode limitations are not the same as production behavior.
- DM, private reply, story reply, comment reply, and publish permissions need a reviewer-ready matrix before submission.

MCP:

- OAuth resource/audience binding is required for connector security.
- MCP bridge must not expose arbitrary internal route calling.
- Tool schemas must reject unexpected dangerous inputs.

OpenAI/ChatGPT Actions:

- Destructive or write actions should be marked consequential in OpenAPI/action metadata where applicable.
- GPT/client prompts should not encourage broad tool use without user intent.

Stripe:

- Subscription access depends on asynchronous webhook events.
- Future entitlement changes must be idempotent and signature-verified.

Supabase:

- RLS must be enabled on user-facing tables.
- Security Advisor findings must be recorded.
- Service-role routes/functions must be treated as privileged boundaries.

Vercel:

- Production launch gates include CSP/security headers, WAF/rate limiting where available, log drains, observability, function region/duration review, load testing, and spend controls.

## Phase Mapping

| Threat cluster | Roadmap phase |
| --- | --- |
| BOLA, role checks, scopes, RLS, token leakage | Phase 1 |
| OAuth connector session lifecycle | Phase 1 |
| Request IDs, logs, idempotency, retries, scheduler/webhook reliability | Phase 2 |
| Media and database bloat, quotas, cleanup | Phase 3 |
| Assistant confirmation safety | Phase 4 |
| Publishing automation due-run safety | Phase 5 |
| Meta app-review proof and permission behavior | Phase 6 |
| Trend provider reliability/legal/cost review | Phase 7 |
| Stripe entitlements and paid gates | Phase 8 |
| Production smoke tests, rollback, monitoring | Phase 9 |

## High-Priority Test Requirements

- Cross-workspace object ID tests for every object route.
- Scope-denial tests for every Developer API route and MCP tool mapping.
- Revoked/expired API key and OAuth refresh tests.
- Meta webhook signature failure and replay tests.
- Scheduler duplicate execution tests.
- Media upload size/MIME/storage path tests.
- Assistant write-action rejection/cancel/confirm tests before enabling writes.
- Stripe webhook signature/idempotency tests before paid gates.

## Accepted Temporary Risks

These are acceptable only during the current pre-launch hardening phase:

- Developer API remains available before paid plan enforcement.
- Some deterministic helper endpoints remain public if they do not read workspace data.
- Some Edge Functions require `--no-verify-jwt` for internal invocation, pending a full internal-auth audit.
- Content Intelligence live provider selection is deferred until Phase 7.
