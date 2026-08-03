# Phase 1 Security Hardening Results

Date: 2026-08-02
Status: local code/test gates complete; deployment smoke checks pending

## Research Baseline

- OWASP API Security Top 10 2023 is the baseline. Phase 1 focuses first on object-level authorization, object-property authorization, broken function-level authorization, unrestricted resource consumption, SSRF, security misconfiguration, and inventory management.
- Supabase RLS guidance requires RLS on exposed-schema tables, including the default `public` schema. The current schema export enables RLS on every tracked public table and policy coverage is now test-backed.
- MCP authorization guidance requires OAuth 2.1-compatible authorization, protected resource metadata, audience validation, secure token storage, HTTPS, PKCE for authorization code flows, and refresh-token rotation for public clients. SwiftFlow already supports OAuth refresh token rotation; opaque DB-backed connector sessions remain a future production hardening item.
- Vercel guidance supports custom/system headers, WAF controls, and Deployment Protection. SwiftFlow currently applies security headers in `proxy.ts`; CSP and Vercel Firewall policy work remain launch-hardening tasks after asset/connect-src requirements are finalized.

References:
- https://owasp.org/www-project-api-security/
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/database-advisors
- https://supabase.com/docs/guides/deployment/going-into-prod
- https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- https://vercel.com/docs/headers
- https://vercel.com/docs/vercel-firewall/vercel-waf
- https://vercel.com/docs/deployment-protection
- https://vercel.com/docs/environment-variables

## Shared Authorization Checklist

Every server route, Developer API route, MCP tool, assistant write path, Edge Function, and database policy should answer these checks before touching user data:

1. User or API identity is authenticated.
2. Active workspace is resolved from trusted state, not from untrusted body fields.
3. Workspace membership is checked with exact `workspace_id` and `user_id`.
4. Workspace role is checked for the requested capability.
5. Object ownership is checked by filtering every object query through `workspace_id` or a workspace-owned parent object.
6. User-controlled object ids are validated before query use.
7. User-controlled property writes are allowlisted; `workspace_id`, `user_id`, API-key status, token fields, protected graph internals, and internal error/result fields cannot be mass-assigned.
8. Destructive or external-side-effect actions have their own scope and audit event.
9. Expensive actions have per-key and per-workspace rate limits.
10. Logs, audit records, and errors never include raw API keys, OAuth codes, Meta tokens, service-role secrets, or full Authorization headers.

## Current Verified Controls

- Workspace roles are centralized in `lib/workspace-rbac.ts`.
- Workspace permission lookup filters `workspace_members` by exact `workspace_id` and `user_id`.
- Developer API keys are one-time tokens; stored tokens use HMAC hashing with server-side pepper.
- Query-string API keys are rejected; bearer tokens are required.
- Developer API scopes are limited to workspace metadata, brand context, engagement automations, and analytics.
- Developer API audit logging records route, action, required scopes, request id, hashed IP, and hashed user agent.
- `lib/security/redaction.ts` redacts sensitive strings and nested log objects before high-risk Developer API, assistant, and Meta OAuth logs are written.
- `supabase/functions/_shared/log-redaction.ts` provides the same redaction behavior for Deno Edge Functions.
- AI-generation and automation-orchestration Edge Function errors now use the shared Deno redactor, and high-risk raw AI output snippets were replaced with length-only logs.
- Developer API paid-plan entitlement is wired but remains in preview mode until payments go live.
- OAuth refresh-token lifecycle for ChatGPT, Claude, and Codex connectors is implemented with short-lived access tokens and rotating refresh tokens.
- The MCP endpoint validates expired or wrong-resource OAuth connector access tokens at the HTTP boundary before JSON-RPC tool handling.
- App-side assistant invocation and content-intelligence trend research routes have user/workspace and IP rate limits before expensive provider calls.
- `proxy.ts` sets `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, production HSTS, and a report-only CSP baseline.
- RLS is enabled for all 25 tracked public tables in `supabase/schema.live.sql`.
- Exported policies exist for all tracked public tables in `supabase/schema-map/policies.csv`.

## Rate-Limit Classes Added In This Phase

| Kind | Limit | Window | Applies To |
| --- | ---: | ---: | --- |
| `read` | 120 | 60s | Normal reads |
| `write` | 30 | 60s | Normal writes |
| `analytics_refresh` | 12 | 60s | Analytics summary with read-through sync |
| `automation_write` | 20 | 60s | Automation create/update/toggle/delete |
| `failed_auth` | 20 | 600s | Invalid token attempts by IP |

## Tests Added

- `tests/security/workspace-authorization.test.ts`
  - proves owner/admin/editor/viewer permission boundaries.
  - proves workspace membership lookup uses exact `workspace_id` and `user_id`.
  - proves missing membership and insufficient roles fail with 403.
- `tests/security/developer-api-scope-matrix.test.ts`
  - proves every declared scope is visible through settings/UI metadata.
  - verifies route source scope and rate-limit contracts for workspace, brand, analytics, and automations.
  - proves every Developer API route contract rejects API keys missing any exact required scope.
  - proves query-string API keys, malformed tokens, inactive keys, expired keys, and under-scoped keys fail.
  - proves valid keys require the exact scope and consume the expected rate-limit bucket.
- `tests/security/rls-policy-inventory.test.ts`
  - proves every table in `table-order.csv` has exported policies.
  - proves every tracked public table has RLS enabled in `schema.live.sql`.
  - proves user-facing workspace tables are scoped by workspace membership or `auth.uid()`.
  - proves internal OAuth/webhook tables are service-role constrained.
- `tests/security/workspace-object-ownership.test.ts`
  - checks Developer API brand, analytics, connected-account, and automation routes are pinned to `context.workspaceId`.
  - checks Developer API key management and assistant chat history are pinned to the active workspace.
  - checks linked social accounts and automation graph inputs remain workspace-scoped.
- `tests/security/cross-workspace-route-mutations.test.ts`
  - executes app route handlers and proves foreign workspace post rows are not updated by app post PUT/PATCH.
  - proves brand profile writes ignore body `workspace_id` and update only the active workspace.
  - proves chat-session create/update/delete paths cannot mutate another workspace's session row.
  - proves workspace settings writes to an unowned workspace id fail before persistence.
  - proves assistant workspace resolution ignores unauthorized body and cookie workspace ids.
- `tests/security/developer-api-audit-wrapper.test.ts`
  - proves `withDeveloperApiAuth` writes audit records for successful write actions.
  - proves auth failures still write audit records with request id, key prefix, route, scopes, and error code.
- `tests/security/developer-api-runtime-audit-routes.test.ts`
  - executes real Developer API route handlers through `withDeveloperApiAuth`.
  - proves route-specific audit records are written for brand-profile writes and automation create/update/toggle/delete.
- `tests/security/developer-api-mcp-auth-lifecycle.test.ts`
  - proves expired OAuth connector access tokens are rejected by `/api/developer/mcp` before tool handling.
  - proves OAuth connector access tokens minted for a different MCP resource are rejected.
- `tests/security/app-expensive-route-rate-limits.test.ts`
  - proves assistant command/invoke routes are rate-limited by user/workspace and IP and redact unexpected errors.
  - proves trend research is rate-limited by workspace user and IP before provider calls and redacts unexpected errors.
- `tests/security/developer-api-audit-actions.test.ts`
  - proves route-specific action names, route labels, scopes, and rate-limit classes stay explicit for brand-profile writes and automation create/update/delete/toggle.
- `tests/security/object-property-escalation.test.ts`
  - proves post, brand profile, chat-session, and workspace-settings sanitizers do not mass-assign protected workspace/user/internal fields.
  - proves local, private, credentialed, and malformed media URLs are rejected before persistence.
- `tests/security/security-headers.test.ts`
  - proves shared proxy headers include frame, MIME sniffing, referrer, permissions, HSTS, and report-only CSP controls.
- `tests/security/secret-redaction.test.ts`
  - proves URL query tokens, bearer tokens, SwiftFlow API keys, OAuth connector tokens, OpenAI-style keys, and nested sensitive object fields are redacted.
  - proves high-risk Developer API, assistant, Meta OAuth, publishing, automation, analytics, comment-sync, message-sync, AI-generation, research, orchestration, scheduled-execution, and graph-executor logs use the redaction helpers.

## Findings Still Open

- Full cross-workspace route mutation tests are now in place for the highest-risk app routes and assistant workspace resolution. Additional route-specific cases can be added as new write surfaces are introduced.
- Runtime route integration tests now assert route-specific audit rows are written through real Developer API route handlers for the current high-risk write/destructive actions.
- OAuth connector hardening should eventually replace self-contained encrypted connector tokens with opaque DB-backed session records.
- CSP is not enforced yet. The new report-only baseline gives us a safe launch path, but enforced CSP needs a full inventory of required image, script, style, connect, Supabase, Meta, and generated-media origins.
- Vercel WAF and Deployment Protection settings must be configured and verified in the Vercel dashboard before launch.
- Source-level secret/token log redaction is now covered for the known high-risk app routes and Edge Functions. Production log sampling still needs to confirm no raw API keys, OAuth codes, Meta tokens, or service-role secrets appear after deployment.
- `docs/security/phase-1-deployment-smoke-checklist.md` defines the remaining deployment-only checks for security headers, CSP report-only review, Vercel Firewall/WAF, Deployment Protection, revoked/expired connector keys, and production log sampling.
- Vercel MCP project lookup for linked project `prj_04P7uAn9Rbw6mS8UF16eKiTFAlSt` returned `403 Forbidden` on 2026-05-18, so WAF and Deployment Protection dashboard/API verification is blocked until a Vercel user with project security access performs it.
