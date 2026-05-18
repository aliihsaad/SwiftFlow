# Security Data-Flow Map

Status date: 2026-05-17

This map describes the data moving through SwiftFlow before the production hardening phases. It focuses on boundaries where authorization, token handling, provider calls, storage retention, and audit logs matter.

## Trust Boundaries

| Boundary | Entry points | Main risks | Required control |
| --- | --- | --- | --- |
| Browser user session to Next.js API | `app/api/**` user routes | BOLA, role bypass, mass assignment, CSRF-like misuse, expensive calls | Supabase user session, workspace membership, role permission, object ownership, rate limits |
| Developer API clients to REST | `/api/developer/v1/**` | Overbroad scopes, stale/revoked keys, destructive action abuse | HMAC-hashed API keys, scope checks, owner/admin key creation, audit logs |
| MCP/connector clients to MCP bridge | `/api/developer/mcp` | OAuth token replay, wrong audience, pass-through token misuse, unsafe tool schemas | OAuth resource validation, backing key validation, no arbitrary route passthrough |
| Meta to webhook | `/api/webhooks/instagram` | Forged webhooks, replay, duplicate processing, PII logging | Verify token/HMAC signature, idempotency keys, safe payload logging |
| Scheduler to Edge Functions | `scheduler-tick`, `/api/cron/scheduler` | Duplicate due runs, public invocation, runaway publishing | Cron secret/service-role auth, locks, idempotency, run records |
| Edge Functions to external providers | Meta, Gemini/OpenRouter/OpenAI, Resend, Unsplash, future trend providers | Token leakage, cost exhaustion, unsafe third-party API consumption | Timeout, retry policy, rate limits, error normalization, request IDs |
| App to Supabase Storage | `post_media`, brand assets, generated images | Storage bloat, public URL exposure, path traversal, unbounded uploads | Workspace-scoped paths, MIME/size validation, quotas, retention cleanup |
| Stripe to app | Future billing webhooks | Entitlement drift, unpaid access, webhook forgery | Stripe signature verification, idempotency, entitlement event handling |

## Workspace and Membership Flow

1. User signs in through Supabase Auth.
2. App stores active workspace selection, usually through `active_workspace_id`.
3. API routes resolve the workspace through `getActiveWorkspace`, explicit `workspaceId`, or helper-specific membership resolution.
4. Workspace-scoped reads/writes must filter by `workspace_id`.
5. Role-specific routes require `requireWorkspacePermission`, such as `settings:write`, `content:write`, `automation:write`, or `workspace:read`.

Phase 1 checks:

- Active workspace cookie cannot grant access without membership.
- Client-provided `workspaceId` cannot bypass membership.
- Service-role queries always include `workspace_id`.
- Owner/admin-only operations are enforced server-side.

## Posts, Drafts, Scheduling, and Publishing

Data:

- `posts` or equivalent scheduled/draft records.
- Platform captions, status, scheduled time, platform list.
- `media_urls` or `mediaUrls`.
- Published platform IDs and error state.

Flows:

1. User routes create/update/schedule posts from the dashboard.
2. Developer API and MCP create/update/list/delete draft or scheduled posts with scopes:
   - `posts:read`
   - `posts:create`
   - `posts:schedule`
   - `posts:publish_now`
   - `posts:update`
   - `posts:delete`
3. Immediate publish requests and scheduled due posts enter `process-scheduled-posts`.
4. `process-scheduled-posts` reads workspace social accounts and decrypted Meta tokens, then calls Meta Graph API.
5. Results update post status, platform IDs, and errors.

Required controls:

- `publish_now` remains separate from draft creation.
- Draft/scheduled deletes cannot delete published posts through Developer API.
- Scheduler uses idempotency keys per post/platform attempt.
- All publishing attempts are auditable with request/run IDs.

## Media and Generated Assets

Data:

- Uploaded base64 media.
- AI-generated image bytes or URLs.
- Public Supabase Storage URLs in `post_media`.
- Brand assets and generated carousel slides.

Flows:

1. Dashboard uploads brand or post media.
2. Developer API `swiftflow_upload_media` accepts base64 and stores to `post_media`.
3. Developer API `swiftflow_generate_post_image` uses the SwiftFlow image pipeline, stores the generated result, and optionally appends/replaces a draft/scheduled post media array.
4. Publishing workers send media URLs to Meta publish endpoints.

Required controls:

- Enforce MIME allowlist and byte-size limits.
- Use workspace-prefixed storage paths.
- Never fetch arbitrary URLs server-side unless SSRF controls exist.
- Add plan-based quotas before public launch.
- Add retention cleanup with dry-run before enabling deletes.

## Analytics and Content Intelligence

Data:

- Synced post metrics.
- Native Facebook/Instagram posts.
- Account followers and account analytics.
- Content intelligence signals and recommendations.
- Evidence labels: live provider, cached provider, benchmark fallback, workspace analytics.

Flows:

1. Dashboard analytics can trigger `/api/sync-analytics`.
2. Developer API `swiftflow_get_analytics_summary` now performs read-through freshness checks before returning stale data.
3. Content Intelligence consumes analytics summaries and post context.
4. Future trend providers must run behind cache, quota, and provider-specific legal/cost checks.

Required controls:

- Analytics reads should not require opening the dashboard first.
- Meta sync must be rate-limited and stale-aware.
- Recommendations must label data source quality.
- Trend providers must not block core analytics.

## Automations

Data:

- Automation rows, editor version, workflow graph, trigger config, node config.
- Social account IDs and Meta account metadata.
- Automation run and node run state.
- Email node context and failure alerts.

Flows:

1. Dashboard creates graph-backed canvas automations.
2. MCP should prefer `swiftflow_create_automation_from_template`, then SwiftFlow compiles stable graph nodes.
3. Raw `workflow_graph` is an advanced path only.
4. Webhooks and sync jobs trigger `automation-orchestrator`.
5. `automation-worker-run` traverses graph nodes.
6. Worker actions can send DMs, private replies, public comment replies, emails, AI responses, conditions, or delays.

Required controls:

- Template creation must stay the default connector path.
- Raw graph creation/update requires strict node and edge validation.
- Story Reply and DM Reply limitations must remain documented until Meta review approval.
- Send Email nodes must include automation context, trigger context, error context, and run IDs.
- Delay and worker resumption need idempotency.

## Developer API Keys and OAuth Connector Tokens

Data:

- API key prefix and HMAC hash.
- API key status, scopes, expiration, creator role snapshot.
- OAuth authorization codes, access tokens, refresh tokens, resource/audience.
- Audit logs.

Flows:

1. Owner/admin creates Developer API key in Settings.
2. Key secret is shown once.
3. REST callers use `Authorization: Bearer sf_live_...`.
4. ChatGPT/Claude/Codex can use MCP OAuth flow.
5. OAuth access tokens are short-lived, refresh tokens rotate, and refresh validates the backing API key.
6. MCP bridge maps tool calls to scoped REST endpoints.

Required controls:

- Revoked/expired Developer API keys invalidate OAuth refresh.
- OAuth tokens must be audience-bound to `/api/developer/mcp`.
- Future hardening should evaluate opaque DB-backed connector sessions.
- All write/destructive calls must audit `api_key_id`, scope, route/tool, workspace, target, and request ID.

## Meta Tokens and Permissions

Data:

- Page access tokens.
- Instagram account IDs.
- User access token metadata.
- Permission-state metadata used to decide publish/comment/message capability.

Flows:

1. User connects Meta account through OAuth.
2. App exchanges/refreshes and stores encrypted tokens.
3. Webhooks identify workspace/social account.
4. Workers decrypt tokens only when calling Meta Graph API.

Required controls:

- Tokens must never be returned to clients or logs.
- App-review limitations must be separated from product bugs.
- Test-mode behavior is not production proof for non-role users.
- Official Meta docs must be checked before changing permission claims or reviewer scripts.

## Billing and Entitlements

Current state:

- Developer API paid-plan gate is planned but intentionally not locked.
- Payment implementation is Phase 8.

Future data:

- Stripe customer ID.
- Subscription status.
- Active entitlement summary.
- Plan limits for Developer API, media storage, AI images, trend research, automation runs, and retention.

Required controls:

- Stripe webhooks must verify signatures.
- Subscription/entitlement events must be idempotent.
- Downgrade behavior needs grace periods.
- Paid gates must not break current owner/admin beta testing until payments are live.

## AI Assistant Action Proposals

Data:

- Chat messages.
- Mode/action selection.
- Context packs.
- Proposed write action previews.
- Confirmation result.
- Audit events.

Flows:

1. User selects Assistant mode: Create, Improve, Analyze, Operate, or Ask.
2. Assistant resolves workspace and builds a context pack.
3. Assistant response renders structured cards where possible.
4. Phase 4 will add confirmed write action cards.
5. Confirmed actions call the same scoped APIs used by the dashboard or Developer API.

Required controls:

- Assistant cannot mutate state without explicit user confirmation.
- Destructive actions require stronger confirmation.
- Mobile cards must not create horizontal overflow.
- Generated action plans should use exact target object IDs and before/after diffs.

## Known Unknowns

- Exact retention windows per Free/Paid plan.
- Whether all old public helper endpoints should stay public or move behind session auth.
- Whether Edge Function gateway JWT settings match the internal auth assumptions in `supabase/functions/README.md`.
- Whether Meta review docs need update for the current app mode and permission names.
- Whether future trend providers are legally/cost suitable for production.
