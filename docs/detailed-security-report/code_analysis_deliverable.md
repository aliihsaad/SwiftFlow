# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the Social Media Manager AI Tool (SwiftFlow). All findings below adhere to this scope definition.

### In-Scope: Network-Reachable Components
The following are considered in-scope as their execution is initiated by network requests the deployed Next.js/Vercel application server receives:
- All 56 API route handlers under `/app/api/**`
- The Next.js middleware (`proxy.ts`) processing incoming requests
- Supabase Edge Functions invoked via HTTP from API routes or webhooks
- OAuth callback endpoints for Meta integration
- Instagram/Facebook webhook receiver endpoints
- Server Actions under `/app/actions/**` triggered by authenticated form submissions
- Client-side pages served by Next.js that interact with API routes

### Out-of-Scope: Locally Executable Only
- `scripts/validate-env.mjs` — CLI build validation script, not network-accessible
- `fix-foreign-keys.sql` — Database migration script, requires direct DB access
- Supabase CLI migration files — Applied via CLI tooling, not network-callable
- Local development environment setup files

---

## 1. Executive Summary

The Social Media Manager AI Tool (SwiftFlow) is a full-stack Next.js 16 application deployed on Vercel's serverless platform, backed by Supabase (PostgreSQL) for data persistence and authentication. The application manages social media publishing workflows for Instagram and Facebook via the Meta Graph API, with AI-powered content generation through Google Gemini, OpenRouter, and OpenAI integrations. The codebase demonstrates a security-conscious design philosophy with comprehensive input validation, AES-256-GCM encryption for secrets at rest, HMAC-SHA256 webhook signature verification, and a well-structured RBAC authorization model.

However, several critical and high-severity security findings demand immediate attention. **The most critical finding is `.env.local` being tracked in git, exposing production-grade credentials including the Supabase service role key, Meta app secret, AI API keys, and the master encryption key (`APP_SECRETS_ENCRYPTION_KEY`).** Since this master key protects all encrypted Meta tokens and API keys in the database, its exposure effectively compromises the entire secrets encryption layer. Additionally, the `automation-worker-http-request` Supabase Edge Function contains a **critical SSRF vulnerability** — it performs unrestricted `fetch()` calls to any URL specified in automation workflow configurations, with no domain allowlisting, private IP blocking, or scheme restrictions.

Beyond these critical issues, the encryption key derivation uses a single SHA-256 pass (rather than PBKDF2/Argon2), no rate limiting is implemented on any API endpoint, and the application returns fully decrypted API keys to authenticated clients via the workspace settings endpoint. The application's attack surface is moderately large with 56 network-accessible endpoints, 10+ Supabase Edge Functions, and deep integration with the Meta Graph API where user-supplied media URLs and account identifiers flow into server-side API calls. The RBAC system is well-designed with five permission levels, but the absence of rate limiting and MFA creates opportunities for credential stuffing and privilege abuse.

## 2. Architecture & Technology Stack

### Framework & Language
The application is built with **Next.js 16.1.1** using the App Router pattern with **React 19.2.3** and **TypeScript 5** in strict mode. Next.js serves as both the frontend framework and the backend API layer via serverless API route handlers deployed on Vercel. The choice of Next.js with the App Router means Server Components and Server Actions are used for sensitive operations, which provides inherent CSRF protection on form submissions. TypeScript strict mode adds compile-time type safety that reduces but does not eliminate runtime injection risks. The serverless Vercel deployment imposes a 30-second function execution timeout (`vercel.json`), which limits but doesn't prevent denial-of-service attacks on computationally expensive endpoints.

Security implications: The serverless architecture means there is no persistent server state between requests, which eliminates some classes of session fixation attacks but also means every request must independently verify authentication. The Vercel Edge Network provides CDN-level DDoS protection, but the application lacks application-layer rate limiting. Next.js does not provide built-in Content Security Policy or HSTS headers — these must be explicitly configured, and they are **not configured** in this codebase.

### Architectural Pattern
The application follows a **three-tier serverless architecture**: (1) React client components communicating with (2) Next.js API routes and Server Actions, which in turn invoke (3) Supabase Edge Functions (Deno runtime) for async processing. Trust boundaries exist at each tier: the client-to-API boundary is protected by Supabase JWT authentication, the API-to-Edge Function boundary uses service role keys, and the Edge Function-to-database boundary uses Supabase RLS policies. A critical trust assumption is that data stored in the database by authenticated users is safe for server-side consumption — this assumption is violated by the SSRF vulnerability in the automation worker, where user-controlled URLs stored in the database are fetched without validation.

### Critical Security Components
- **Authentication**: Supabase Auth (JWT-based) with HTTP-only session cookies
- **Authorization**: Custom RBAC system (`lib/workspace-rbac.ts`, `lib/workspace-permissions.ts`) with five roles (owner, admin, editor, viewer) and seven permission types
- **Secrets Encryption**: AES-256-GCM via `lib/secret-crypto.ts` with SHA-256-derived key from environment variable
- **Input Validation**: Comprehensive custom validation library (`lib/security/phase1-validation.ts`) with allowlists, size limits, regex patterns, and JSON depth restrictions
- **Webhook Security**: HMAC-SHA256 signature verification with timing-safe comparison (`app/api/webhooks/instagram/route.ts`)
- **OAuth Security**: Meta OAuth with state nonce binding, timestamp freshness validation (10-minute TTL), and secure cookie storage
- **Middleware**: Route protection via `proxy.ts` enforcing authentication on `/dashboard` routes and workspace validation via cookies

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

The application uses **Supabase Auth** as its primary authentication provider, managing user sessions via JWT tokens stored in HTTP-only cookies. The Supabase SSR package (`@supabase/ssr 0.8.0`) handles automatic session refresh on the server side via `utils/supabase/server.ts`. The auth callback at `app/auth/callback/route.ts` exchanges authorization codes for sessions using `exchangeCodeForSession()`. No password-based authentication is implemented directly — all user authentication flows through Supabase's managed authentication (likely magic links or social login).

For third-party integration, the application implements a **Meta OAuth 2.0 flow** with strong security properties. The OAuth initiation endpoint (`app/api/auth/meta/login/route.ts`) generates a cryptographically random state nonce via `crypto.randomUUID()`, encodes it as base64url with the workspace ID and creation timestamp, and stores it in an HTTP-only cookie (`meta_oauth_state`) with `sameSite: 'lax'` and `secure: true` (production). The callback handler (`app/api/auth/meta/callback/route.ts`, 315 lines) validates the state parameter against the cookie, enforces a **10-minute freshness window**, exchanges the authorization code for tokens via server-side API call with the app secret, and verifies granted scopes via the Meta debug_token endpoint.

**Authentication Endpoints (Exhaustive List):**
| Endpoint | Method | Purpose |
|---|---|---|
| `/auth/callback` | GET | Supabase auth code exchange |
| `/api/auth/meta/login` | GET | Initiate Meta OAuth flow |
| `/api/auth/meta/callback` | GET | Meta OAuth callback handler |
| `/api/auth/meta/select-page` | POST | Complete OAuth by selecting Facebook page |
| `/api/auth/meta/page-session` | GET | Retrieve temporary OAuth session data |
| `/api/auth/social/callback` | GET | Legacy OAuth callback (DISABLED — returns error redirect) |
| `/api/auth/social/connect/[platform]` | GET | Legacy OAuth connect (DISABLED — returns error redirect) |

### Session Management & Cookie Security

Session cookies are configured in multiple locations with the following flags:

**Active Workspace Cookie** (`app/actions/team-members.ts`, lines 397-403, 462-468):
```
Cookie: active_workspace_id
HttpOnly: true
SameSite: 'lax'
Secure: true (production only)
Path: '/'
```

**OAuth State Cookie** (`app/api/auth/meta/login/route.ts`, lines 41-47):
```
Cookie: meta_oauth_state
HttpOnly: true
SameSite: 'lax'
Secure: true (production only)
MaxAge: 600 (10 minutes)
```

The `Secure` flag is conditionally set based on the environment, meaning development environments transmit cookies over HTTP — this is standard practice but should be verified in staging/production. The `SameSite: 'lax'` setting provides CSRF protection for state-changing POST requests while allowing top-level navigation (necessary for OAuth redirects).

### Authorization Model

The RBAC system is implemented across two files:
- **`lib/workspace-rbac.ts`** (lines 1-32): Defines role types and the permission-to-role mapping
- **`lib/workspace-permissions.ts`** (lines 1-64): Enforces permissions via `requireWorkspacePermission()` which throws `WorkspacePermissionError` (HTTP 403)

**Role Hierarchy:**
| Permission | Owner | Admin | Editor | Viewer |
|---|---|---|---|---|
| `workspace:read` | ✓ | ✓ | ✓ | ✓ |
| `content:write` | ✓ | ✓ | ✓ | ✗ |
| `automation:write` | ✓ | ✓ | ✗ | ✗ |
| `settings:write` | ✓ | ✓ | ✗ | ✗ |
| `integrations:write` | ✓ | ✓ | ✗ | ✗ |
| `members:manage` | ✓ | ✗ | ✗ | ✗ |
| `analytics:sync` | ✓ | ✓ | ✗ | ✗ |

**Potential Bypass Scenarios:**
1. **Missing permission checks on specific endpoints**: While most endpoints enforce permissions, `/api/ai/validate-key` is **unauthenticated** — it accepts API keys and makes outbound validation requests. An attacker could use this as a key validation oracle.
2. **Workspace isolation relies on application-layer filtering**: All database queries filter by `workspace_id`, but this is enforced at the application level via `requireWorkspacePermission()` rather than exclusively at the database level. If a code path omits the workspace filter, cross-tenant data leakage is possible.
3. **Invite token brute-forcing**: Invite tokens are generated using two concatenated UUIDs (64 hex chars), providing sufficient entropy. However, there is no rate limiting on invite acceptance, and tokens have a 7-day expiration window.

### Multi-Tenancy Security

Workspace isolation is enforced at three levels: (1) JWT authentication verifying user identity, (2) workspace membership lookup via `getWorkspaceRoleForUser()`, and (3) Supabase RLS policies filtering by workspace_id. The application enforces a strict one-Facebook-page and one-Instagram-account per workspace rule (`app/api/auth/meta/select-page/route.ts`), preventing cross-workspace social account sharing. Team member management is restricted to workspace owners only (`requireWorkspaceManageRole()` in `app/actions/team-members.ts`, lines 64-87).

### SSO/OAuth/OIDC Flows

The Meta OAuth callback endpoint is at `/api/auth/meta/callback` (`app/api/auth/meta/callback/route.ts`). State parameter validation occurs at lines 85-97: the `state` query parameter is decoded from base64url, the `nonce` is compared against the cookie value, and the `createdAt` timestamp is checked against `META_OAUTH_STATE_MAX_AGE_MS` (10 minutes). The cookie is cleared immediately after validation. **No OIDC `nonce` parameter is used** since this is a pure OAuth 2.0 flow, not OpenID Connect. The `state` parameter serves both CSRF protection and session binding purposes.

## 4. Data Security & Storage

### Database Security

The application uses **PostgreSQL via Supabase** with Row-Level Security (RLS) as a key data isolation mechanism. Analysis of `supabase/migrations/20260221050000_baseline_schema.sql` reveals that **RLS is enabled on all 25+ tables** in the baseline migration, with policies enforcing workspace membership checks via `is_member_of(workspace_id)` functions. Storage buckets (`post_media`, `generated_assets`) have RLS policies requiring authentication for uploads and allowing public reads (`supabase/migrations/20260224120000_storage_rls_policies.sql`).

However, earlier schema files (`supabase/schema.sql`) show several tables with `DISABLE ROW LEVEL SECURITY` statements for `workspace_brand_profiles`, `chat_sessions`, and `external_services`. The migration files (which are authoritative for deployment) enable RLS properly, suggesting the schema.sql file may be outdated. **Penetration testers should verify RLS enforcement on production tables**, particularly on tables storing sensitive data like `external_services` (passwords, API keys) and `social_accounts` (Meta tokens).

All database queries use the Supabase client library's parameterized methods (`.eq()`, `.select()`, `.insert()`, etc.) — **no raw SQL string concatenation was found**, effectively eliminating SQL injection risks at the application layer.

### Data Flow Security

**Meta Access Tokens**: Flow from OAuth callback → `encryptMetaToken()` → database storage → `decryptMetaToken()` → Meta Graph API calls. Tokens are encrypted with AES-256-GCM before database insertion (lines 269, 287 of callback route). The page session endpoint (`app/api/auth/meta/page-session/route.ts`) explicitly excludes access tokens from client responses — a strong security practice.

**AI API Keys**: Flow from workspace settings UI → `encryptSecretIfNeeded()` → `workspace_settings` table → `decryptSecretIfNeeded()` → Edge Function invocation headers. **Critical concern**: The GET endpoint at `/api/workspace/settings` returns fully decrypted API keys to authenticated clients (`decryptWorkspaceSettingsSecrets()` at line 119). While protected by authentication and `workspace:read` permission, this exposes plaintext keys in HTTP responses, browser memory, and potentially network logs.

**Encryption Implementation** (`lib/secret-crypto.ts`): Uses AES-256-GCM with 12-byte random IVs (`crypto.randomBytes(12)`), which is cryptographically sound. However, the key derivation is weak — a single SHA-256 pass over the environment variable value. This provides no brute-force resistance if the seed has low entropy. The encryption format (`enc:v1:`) includes versioning for future migration, which is good practice.

### Multi-tenant Data Isolation

All multi-tenant queries include `workspace_id` filtering at the application layer. Social accounts are bound to workspaces and the page selection flow (`app/api/auth/meta/select-page/route.ts`, lines 112-144) prevents connecting a Facebook page already linked to another workspace. Database-level RLS policies serve as a defense-in-depth layer, checking workspace membership independently of application code.

## 5. Attack Surface Analysis

### External Entry Points (In-Scope, Network-Accessible)

The application exposes **56 network-accessible endpoints** across the following categories:

**Unauthenticated Endpoints (Highest Risk):**
| Endpoint | Risk | Notes |
|---|---|---|
| `POST /api/ai/validate-key` | HIGH | Accepts API keys, makes outbound validation requests to OpenRouter/OpenAI/Gemini. No auth required. Could be used as API key validation oracle. |
| `POST /api/webhooks/instagram` | HIGH | Accepts Meta webhook payloads. Protected by HMAC-SHA256 signature verification. |
| `GET /api/webhooks/instagram` | LOW | Webhook verification handshake — returns challenge token. |
| `GET /api/recommend-timeslots` | LOW | Returns static time recommendations. No data exposure. |
| `GET /api/recommend-next-slot` | LOW | Returns next hour start. No data exposure. |
| `POST /api/automations/validate` | MEDIUM | Accepts workflow graphs for design-time validation. No side effects but exposes validation logic. |

**High-Value Authenticated Endpoints:**
| Endpoint | Permission | Risk | Notes |
|---|---|---|---|
| `POST /api/posts` | `content:write` | HIGH | Creates/publishes posts — triggers Meta API publishing with user-supplied media URLs |
| `POST /api/auth/meta/select-page` | `integrations:write` | HIGH | Completes OAuth flow, stores encrypted tokens |
| `POST /api/automations` | `automation:write` | CRITICAL | Creates automation workflows with arbitrary graph configs — leads to SSRF via HTTP request nodes |
| `PUT /api/workspace/settings` | `settings:write` | HIGH | Stores encrypted AI API keys |
| `GET /api/workspace/settings` | `workspace:read` | HIGH | Returns decrypted AI API keys |
| `POST /api/assistant/invoke` | Membership | MEDIUM | Invokes Edge Functions — whitelisted function names |
| `POST /api/messages` | `content:write` | MEDIUM | Sends messages via Meta API |
| `POST /api/cron/scheduler` | CRON_SECRET | HIGH | Triggers scheduled post processing and automation execution |

**Webhook Processing (External-Triggered):**
The Instagram webhook handler (`POST /api/webhooks/instagram`, 763 lines) is the most complex single endpoint. It processes: comment events, feed events, message events (with attachment persistence), story mentions, and story replies. Each event type triggers different handler functions and may invoke the automation orchestrator Edge Function. The signature verification using `crypto.timingSafeEqual()` is correctly implemented, preventing timing-based signature forgery.

### Internal Service Communication

The API routes communicate with Supabase Edge Functions via HTTP using service role authentication. The `supabase/functions/_shared/edge-invoke.ts` utility detects JWT vs API key format and sets appropriate headers. Trust assumption: Edge Functions trust all requests bearing the service role key. This means any compromised API route can invoke any Edge Function with full privileges.

**Edge Functions inventory:**
- `generate-caption` — AI caption generation
- `chat-assistant` — AI chat functionality
- `generate-image` — AI image generation
- `generate-ideas` — Content idea generation
- `generate-carousel` — Carousel content generation
- `generate-reply` / `generate-message-reply` — AI response generation
- `process-scheduled-posts` — Post publishing to Meta API
- `process-automations` / `process-scheduled-executions` — Automation execution
- `automation-orchestrator` — Automation workflow management
- `automation-worker-http-request` — **CRITICAL: Unrestricted HTTP request execution**
- `sync-analytics` — Analytics data synchronization
- `send-invite-email` — Email sending via Resend API

### Input Validation Patterns

The custom validation library (`lib/security/phase1-validation.ts`, 519 lines) implements defense-in-depth:
- **Size limits**: JSON body (5MB default, 256KB for posts, 64KB for auth), base64 images (4MB), messages (8,000 chars)
- **Allowlists**: Platforms (`instagram`, `facebook`), post statuses, AI providers, tones, brand voices
- **Regex validation**: UUIDs (`^[0-9a-f]{8}-...`), Meta account IDs (`^[0-9]{3,32}$`), hex colors (`^#[0-9a-f]{6}$`), HTTP/HTTPS URLs
- **Structural limits**: JSON depth (6 levels), array items (100), object keys (50)
- **Prototype pollution prevention**: Filters `__proto__`, `prototype`, and `constructor` keys
- **Sanitization functions**: Dedicated sanitizers for each endpoint payload type (e.g., `sanitizePostPayload()`, `sanitizeBrandProfilePayload()`)

### Background Processing

Scheduled post processing is triggered by the `/api/cron/scheduler` endpoint, which requires a `CRON_SECRET` bearer token or Vercel cron header. The scheduler invokes `process-scheduled-posts` and `process-scheduled-executions` Edge Functions. Automation workflows are processed by the `automation-orchestrator` and `automation-worker-*` Edge Functions. The HTTP request worker (`automation-worker-http-request`) has no URL restrictions — this is the primary SSRF attack vector.

### Notable Out-of-Scope Components
- `scripts/validate-env.mjs` — Build-time environment variable checker, CLI only
- `fix-foreign-keys.sql` — Database migration script, requires direct Supabase access
- `supabase/migrations/*.sql` — Applied via Supabase CLI, not network-accessible

## 6. Infrastructure & Operational Security

### Secrets Management

The application uses environment variables for all secrets, with a master encryption key (`APP_SECRETS_ENCRYPTION_KEY`) protecting database-stored credentials. **CRITICAL FINDING**: The `.env.local` file is tracked in git (`git ls-files .env.local` confirms tracking) despite `.gitignore` containing `.env*`. This file contains production-grade credentials including `SUPABASE_SERVICE_KEY`, `META_APP_SECRET`, `GEMINI_API_KEY`, `RESEND_API_KEY`, and `APP_SECRETS_ENCRYPTION_KEY`. The file permissions are world-readable (`-rwxrwxrwx`). The Supabase anon key JWT has an expiration date of 2036, providing an extremely long validity window.

Secret rotation mechanisms are **absent** — there is no key versioning, no rotation scripts, and no integration with a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.). The encryption format (`enc:v1:`) includes a version prefix suggesting future rotation was considered but not implemented. The build validation script (`scripts/validate-env.mjs`) checks for required environment variables but does not validate their security properties (length, entropy, format).

### Configuration Security

The application is deployed on **Vercel** with minimal configuration (`vercel.json` specifies IAD1 region and 30-second max duration). No explicit security headers are configured — **no Content Security Policy, no HSTS (Strict-Transport-Security), no Permissions-Policy, no Referrer-Policy, and no X-XSS-Protection**. Vercel provides default `X-Content-Type-Options: nosniff` and `X-Frame-Options` headers, but these are framework defaults, not application-configured. No nginx, Kubernetes Ingress, or CDN-level security header configuration was found — the application relies entirely on Vercel's platform defaults.

The Supabase Edge Functions set permissive CORS headers (`Access-Control-Allow-Origin: '*'`) in `supabase/functions/automation-orchestrator/index.ts`. While Edge Functions are not directly accessible from browsers (they're called server-side from API routes), this configuration could be exploited if Edge Function URLs are discovered.

### External Dependencies

The application integrates with multiple external services, each representing an additional attack surface:
- **Meta Graph API** (`graph.facebook.com`): Publishing, comments, messages, analytics. User-supplied media URLs flow to Meta's servers.
- **Supabase**: PostgreSQL database, authentication, storage, Edge Functions, Realtime. Service role key provides full database access.
- **Google Gemini API** (`generativelanguage.googleapis.com`): AI text generation. API keys stored encrypted in database.
- **OpenRouter API** (`openrouter.ai`): AI model routing. API keys validated via unauthenticated endpoint.
- **OpenAI API** (`api.openai.com`): AI capabilities. API keys validated via unauthenticated endpoint.
- **Resend API**: Email delivery for workspace invitations via `send-invite-email` Edge Function.

The `package.json` lists 30+ dependencies including Radix UI components, SWR, Zustand, and date-fns. The `package-lock.json` contains 546 packages. No dependency security scanning (npm audit, Snyk) integration was detected.

### Monitoring & Logging

No dedicated logging or monitoring infrastructure was identified. The application uses `console.log` statements for debugging (visible in Vercel function logs), including webhook payload summaries in development mode (`DEBUG_INSTAGRAM_MESSAGE_WEBHOOK_PAYLOAD` flag). There is no structured logging, no security event audit trail, and no alerting for suspicious activity (failed auth attempts, rate limit violations, etc.). Vercel Analytics provides basic observability but not security-specific monitoring.

## 7. Overall Codebase Indexing

The codebase follows a standard Next.js App Router structure with the root directory containing configuration files (`next.config.ts`, `tsconfig.json`, `vercel.json`, `package.json`), a `proxy.ts` middleware file, and the primary `app/` directory housing all pages and API routes. The `app/api/` directory contains 20+ subdirectories organizing endpoints by domain (auth, posts, automations, webhooks, chat, ai, etc.), with each endpoint implemented as a `route.ts` file exporting HTTP method handlers. The `lib/` directory contains shared security libraries (`workspace-permissions.ts`, `workspace-rbac.ts`, `secret-crypto.ts`, `security/phase1-validation.ts`, `meta-account.ts`), which are the most critical files for understanding the security architecture. The `utils/` directory holds integration utilities (`meta-oauth.ts`, `meta-publish.ts`, `supabase/server.ts`), and the `supabase/` directory contains the database schema (`schema.sql`, `schema.live.sql`), migration files, and Edge Function source code under `supabase/functions/`. Edge Functions share common code via `supabase/functions/_shared/` (including a Deno-compatible version of `secret-crypto.ts` and `edge-invoke.ts`). Server Actions are located in `app/actions/` and handle form submissions for team member management, workspace operations, and settings. The `components/` directory contains React UI components, and `public/` holds static assets. No API schema files (OpenAPI, Swagger, GraphQL) were found in the codebase. The absence of a dedicated test directory or testing framework configuration means security testing coverage cannot be assessed.

## 8. Critical File Paths

### Configuration
- `next.config.ts` — Next.js configuration
- `vercel.json` — Vercel deployment configuration (region, function duration)
- `tsconfig.json` — TypeScript strict mode configuration
- `package.json` — Dependency manifest (30+ packages)
- `package-lock.json` — Lock file (546 packages)
- `eslint.config.mjs` — Linting configuration
- `.env.local` — **CRITICAL: Tracked production secrets**
- `env.example` — Environment variable documentation
- `.env.vercel.example` — Vercel environment template

### Authentication & Authorization
- `lib/workspace-permissions.ts` — RBAC permission enforcement (`requireWorkspacePermission()`)
- `lib/workspace-rbac.ts` — Role-to-permission mapping
- `utils/supabase/server.ts` — Supabase server-side client with cookie session management
- `app/auth/callback/route.ts` — Supabase auth code exchange
- `app/api/auth/meta/login/route.ts` — Meta OAuth initiation with state nonce
- `app/api/auth/meta/callback/route.ts` — Meta OAuth callback handler (315 lines)
- `app/api/auth/meta/select-page/route.ts` — OAuth page selection and token storage
- `app/api/auth/meta/page-session/route.ts` — Temporary OAuth session retrieval
- `app/api/auth/social/callback/route.ts` — Legacy OAuth callback (disabled)
- `app/api/auth/social/connect/[platform]/route.ts` — Legacy OAuth connect (disabled)
- `utils/meta-oauth.ts` — OAuth URL generation, scope management, code exchange
- `proxy.ts` — Middleware: route protection, workspace validation

### API & Routing
- `app/api/posts/route.ts` — Post CRUD with publishing triggers
- `app/api/posts-media/route.ts` — Media fetching from Meta API
- `app/api/posts-media/comments/route.ts` — Comment management via Meta API
- `app/api/messages/route.ts` — Conversation/message management
- `app/api/live-messages/route.ts` — Live message fetching
- `app/api/live-messages/send/route.ts` — Live message sending
- `app/api/automations/route.ts` — Automation CRUD (graph-based workflows)
- `app/api/automations/[id]/route.ts` — Single automation management
- `app/api/automations/[id]/toggle/route.ts` — Automation activation toggle
- `app/api/automations/validate/route.ts` — Workflow graph validation
- `app/api/automations/process/route.ts` — Automation processing trigger
- `app/api/automations/social-accounts/route.ts` — Social accounts for automations
- `app/api/automations/media/route.ts` — Media for automation triggers
- `app/api/ai/generate-caption/route.ts` — AI caption generation
- `app/api/ai/generate-ideas/route.ts` — AI content idea generation
- `app/api/ai/models/route.ts` — AI model listing
- `app/api/ai/validate-key/route.ts` — **Unauthenticated** AI key validation
- `app/api/assistant/invoke/route.ts` — Edge Function invocation with whitelist
- `app/api/webhooks/instagram/route.ts` — **763 lines**: Meta webhook handler
- `app/api/sync-analytics/route.ts` — Analytics sync trigger
- `app/api/analytics/route.ts` — Analytics data retrieval
- `app/api/chat/sessions/route.ts` — Chat session CRUD
- `app/api/chat/sessions/[id]/route.ts` — Single chat session retrieval
- `app/api/brand-profile/route.ts` — Brand profile CRUD
- `app/api/workspace/settings/route.ts` — Workspace settings (decrypts API keys)
- `app/api/external-services/route.ts` — External service credential management
- `app/api/brand/social-accounts/route.ts` — Social account disconnection
- `app/api/brand/social-status/route.ts` — Social connection status
- `app/api/cron/scheduler/route.ts` — Cron job trigger (CRON_SECRET auth)
- `app/api/recommend-timeslots/route.ts` — Public time recommendations
- `app/api/recommend-next-slot/route.ts` — Public next slot recommendation
- `app/api/test-db/route.ts` — Legacy debug endpoint (disabled)

### Data Models & DB Interaction
- `supabase/schema.sql` — Primary schema definition (388 lines)
- `supabase/schema.live.sql` — Alternate/live schema
- `supabase/migrations/20260221050000_baseline_schema.sql` — Baseline migration with RLS policies
- `supabase/migrations/20260224120000_storage_rls_policies.sql` — Storage bucket RLS
- `fix-foreign-keys.sql` — Foreign key fixes

### Dependency Manifests
- `package.json` — npm dependencies
- `package-lock.json` — Lock file

### Sensitive Data & Secrets Handling
- `lib/secret-crypto.ts` — AES-256-GCM encryption/decryption (Node.js)
- `supabase/functions/_shared/secret-crypto.ts` — AES-256-GCM (Deno/Edge runtime)
- `lib/meta-account.ts` — Meta token encrypt/decrypt wrappers
- `.env.local` — **CRITICAL: Contains production secrets, tracked in git**

### Middleware & Input Validation
- `lib/security/phase1-validation.ts` — Comprehensive input validation library (519 lines)
- `proxy.ts` — Route protection and workspace validation middleware

### Logging & Monitoring
- No dedicated logging files identified — uses `console.log` throughout

### Infrastructure & Deployment
- `vercel.json` — Vercel serverless deployment configuration
- `supabase/functions/` — 10+ Edge Functions (Deno runtime)
- `supabase/functions/_shared/edge-invoke.ts` — Edge Function invocation utility
- `supabase/functions/automation-orchestrator/index.ts` — Automation workflow engine
- `supabase/functions/automation-worker-http-request/index.ts` — **CRITICAL SSRF**: Unrestricted HTTP request worker
- `supabase/functions/process-scheduled-posts/index.ts` — Post publishing engine
- `supabase/functions/sync-analytics/index.ts` — Analytics synchronization
- `supabase/functions/send-invite-email/index.ts` — Email delivery

## 9. XSS Sinks and Render Contexts

### Network Surface Focus Assessment

This is a Next.js 16 / React 19 application using the App Router with Server Components. React's JSX rendering automatically escapes content by default, providing strong baseline XSS protection. After thorough analysis, **no high-severity XSS sinks were identified** in the network-accessible attack surface.

### Findings

**No `dangerouslySetInnerHTML` Usage Found:** The entire codebase was searched and no instances of `dangerouslySetInnerHTML` were found. All content rendering goes through React's standard JSX escaping.

**No Direct DOM Manipulation:** No usage of `innerHTML`, `outerHTML`, `document.write()`, `document.writeln()`, `insertAdjacentHTML()`, or jQuery was found in network-accessible components.

**No JavaScript Context Sinks:** No `eval()`, `Function()` constructor, `setTimeout()`/`setInterval()` with string arguments, or dynamic `<script>` tag creation was found.

### Low-Risk Findings

**1. URL Query Parameter Reflection in Client Navigation**
- **File:** `app/dashboard/settings/select-page/page.tsx`, line 44
- **Sink:** `fetch(\`/api/auth/meta/page-session?sessionId=${sessionId}\`)`
- **Context:** URL context — `sessionId` extracted from `searchParams.get("session")` and injected into fetch URL
- **Mitigation:** Server-side validates `sessionId` as UUID via `sanitizeMetaPageSessionId()`
- **Risk:** LOW — Parameter injection possible but limited to query string of internal API call

**2. Dynamic Route Parameter in Fetch URL**
- **File:** `app/dashboard/automation/page.tsx`, line 132
- **Sink:** `fetch(\`/api/automations/${automationId}/toggle\`)`
- **Context:** URL context — `automationId` used in URL path construction
- **Mitigation:** Server-side validates UUID format
- **Risk:** LOW — Path traversal limited by Next.js routing

**3. OAuth Error Message Reflection**
- **File:** `app/api/auth/meta/callback/route.ts`, line 69
- **Sink:** `redirectWithError(\`/dashboard/settings/brand?error=${encodeURIComponent(errorDescription || error)}\`)`
- **Context:** URL context — Meta OAuth error descriptions reflected in redirect URL
- **Mitigation:** `encodeURIComponent()` applied to error message
- **Risk:** LOW — Properly encoded, no XSS vector, but error details may appear in browser address bar

**4. JSON.parse on Untrusted Input (Server-Side)**
- **Files:** `app/actions/posts.ts` (line 9), `app/api/webhooks/instagram/route.ts` (line 167), `app/api/auth/meta/callback/route.ts` (lines 90, 151, 185)
- **Sink:** `JSON.parse()` on request bodies
- **Context:** Server-side only (not a browser XSS context)
- **Mitigation:** Prototype pollution prevented by `phase1-validation.ts` filtering `__proto__`, `prototype`, `constructor` keys
- **Risk:** LOW — Server-side only, properly mitigated

### Summary

The application's React-based rendering provides strong default XSS protection. No dangerous rendering patterns (dangerouslySetInnerHTML, direct DOM manipulation, eval) were found. The low-risk findings involve URL construction with user input that is either properly encoded or validated server-side. **Recommendation:** Implement Content Security Policy headers as defense-in-depth against any future XSS introduction.

## 10. SSRF Sinks

### Critical SSRF Findings

**1. CRITICAL: Unrestricted HTTP Request in Automation Worker**
- **File:** `supabase/functions/automation-worker-http-request/index.ts`, line 29
- **Sink:** `fetch(String(config.url || ''), options)`
- **Purpose:** Executes HTTP requests as part of automation workflow steps
- **User Input Flow:** User creates automation workflow → configures HTTP request node with arbitrary URL → automation executor invokes this Edge Function → `fetch()` called with user-controlled URL, method, headers, and body
- **Controllable Parameters:** URL (fully), HTTP method, headers, request body
- **Risk Level:** CRITICAL
- **Attack Scenarios:**
  - Cloud metadata service access: `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
  - Internal network scanning: `http://10.0.0.1:8080/`, `http://localhost:5432/`
  - Internal service exploitation: Access to Supabase internal endpoints
  - Data exfiltration via response body (first 1000 chars returned to caller)
- **Missing Controls:** No URL scheme validation, no private IP blocking, no domain allowlisting, no port restrictions

**2. CRITICAL: Media URL Injection in Meta Publishing**
- **File:** `utils/meta-publish.ts` — Multiple functions
- **Sinks:**
  - `publishToFacebookPhoto()` (lines 123-168): `url: imageUrl` in POST to `/{pageId}/photos`
  - `publishToInstagram()` (lines 174-255): `image_url: imageUrl` in POST to `/{igUserId}/media`
  - `publishToInstagramCarousel()` (lines 265-378): loops through `imageUrls`
  - `publishToInstagramVideo()` (lines 384-487): `video_url: videoUrl`
  - `publishToFacebookVideo()` (lines 492-537): `file_url: videoUrl`
  - `publishToFacebookMultiPhoto()` (lines 546-624): loops through `imageUrls`
- **User Input Flow:** User creates post with media URLs → URLs stored in database → scheduler triggers publishing → URLs passed to Meta Graph API as media source URLs → Meta servers fetch the URLs
- **Risk Level:** HIGH — Meta's servers become the SSRF vector, fetching attacker-controlled URLs. Limited response visibility but can be used for blind SSRF/port scanning via timing analysis.

**3. CRITICAL: Media URL Injection in Scheduled Post Processing**
- **File:** `supabase/functions/process-scheduled-posts/index.ts` — Multiple functions
- **Sinks:** Same pattern as `meta-publish.ts` — user-supplied media URLs passed to Meta Graph API endpoints
- **User Input Flow:** Same as finding #2, but executed via Edge Function during scheduled processing
- **Risk Level:** HIGH — Same SSRF vector via Meta API media fetching

### Medium-Risk SSRF Findings

**4. Meta Graph API Parameter Injection**
- **File:** `app/api/auth/meta/callback/route.ts`, lines 206-220
- **Sink:** `fetch(\`${META_GRAPH_URL}/${pageId}?fields=...&access_token=...\`)`
- **User Input Flow:** `pageId` from Meta `debug_token` response's `granular_scopes[].target_ids` → injected into URL path
- **Risk Level:** MEDIUM — `pageId` originates from Meta's API response (semi-trusted), but parameter injection possible if ID contains `&` or `?` characters

**5. AI Provider API Key Validation (Unauthenticated)**
- **File:** `app/api/ai/validate-key/route.ts`, lines 26-88
- **Sinks:**
  - Line 26: `fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: \`Bearer ${trimmedKey}\` } })`
  - Line 49: `fetch("https://api.openai.com/v1/models?limit=1", { headers: { Authorization: \`Bearer ${trimmedKey}\` } })`
  - Line 67: `fetch(\`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(apiKey)}\`)`
- **User Input Flow:** Unauthenticated user provides API key → server makes validation request to AI provider
- **Risk Level:** MEDIUM-LOW — Endpoints are hardcoded (no URL control), but this is an unauthenticated endpoint making outbound requests. Could be abused for:
  - API key enumeration/validation oracle
  - Timing-based information leakage about key validity
  - Potential abuse if AI provider endpoints have side effects

**6. Supabase Edge Function Invocation**
- **File:** `app/api/assistant/invoke/route.ts`, line 108
- **Sink:** `fetch(\`${supabaseUrl}/functions/v1/${functionName}\`, ...)`
- **User Input Flow:** User provides `functionName` in request body → validated against `ALLOWED_FUNCTIONS` whitelist
- **Risk Level:** LOW — **Properly mitigated** by strict allowlist of 6 function names
- **Allowlisted Functions:** `chat-assistant`, `generate-image`, `generate-ideas`, `generate-carousel`, `generate-reply`, `generate-message-reply`

### Redirect & Return URL Handlers

**7. OAuth Redirect with Error Parameters**
- **File:** `app/api/auth/meta/callback/route.ts`, line 69
- **Sink:** `redirect(\`/dashboard/settings/brand?error=${encodeURIComponent(...)}\`)`
- **Risk Level:** LOW — Redirect target is hardcoded to internal path, only error message is user-influenced and properly encoded

### Summary Table

| # | File | Line(s) | Sink Type | Risk | User Control |
|---|---|---|---|---|---|
| 1 | `supabase/functions/automation-worker-http-request/index.ts` | 29 | HTTP fetch | CRITICAL | Full URL, method, headers, body |
| 2 | `utils/meta-publish.ts` | 123-624 | Media URL to Meta API | HIGH | Media URLs |
| 3 | `supabase/functions/process-scheduled-posts/index.ts` | Multiple | Media URL to Meta API | HIGH | Media URLs |
| 4 | `app/api/auth/meta/callback/route.ts` | 206-220 | Graph API path injection | MEDIUM | Page ID in URL path |
| 5 | `app/api/ai/validate-key/route.ts` | 26-88 | AI API validation | MEDIUM-LOW | API key in auth header |
| 6 | `app/api/assistant/invoke/route.ts` | 108 | Edge Function invoke | LOW | Function name (whitelisted) |
| 7 | `app/api/auth/meta/callback/route.ts` | 69 | Redirect | LOW | Error message (encoded) |
