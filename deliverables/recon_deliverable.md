# Reconnaissance Deliverable: SwiftFlow Social Media Manager AI Tool

## 0) HOW TO READ THIS

This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint — focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls — understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping — use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

---

## 1. Executive Summary

**SwiftFlow** is a full-stack Social Media Manager AI Tool that automates publishing, messaging, analytics, and AI-powered content generation for Instagram and Facebook. The application is built on **Next.js 16 (App Router)** deployed on **Vercel serverless**, backed by **Supabase** (PostgreSQL + Auth + Edge Functions/Deno runtime). Users manage social media workflows organized under multi-tenant "Workspaces" — isolated environments sharing the same application instance. AI content generation integrates Google Gemini, OpenRouter, and OpenAI APIs; social publishing flows through the Meta Graph API.

**Primary user-facing components constituting the attack surface:**
1. **Authentication Flow** — Email/password sign-in and sign-up via Supabase Auth; Meta OAuth for social account connection
2. **Post Management** — Create, schedule, and publish content to Instagram/Facebook with media URLs
3. **Automation Engine** — Graph-based workflow builder with HTTP request nodes (SSRF vector)
4. **AI Generation** — Caption generation, image generation, chatbot assistant powered by third-party LLMs
5. **Messaging Center** — Read/reply to Instagram DMs and Facebook messages
6. **Analytics Dashboard** — Sync and view engagement data from Meta Graph API
7. **Team Management** — Workspace invite/role management system
8. **Webhook Receiver** — Instagram/Facebook event processing endpoint

**Critical security posture:** The most severe finding from pre-recon is the **unauthenticated SSRF** in the automation workflow HTTP request worker Edge Function (`automation-worker-http-request`). Additionally, **no rate limiting** exists on any endpoint, **no security headers** (CSP, HSTS) are configured, and several endpoints lack RBAC enforcement.

---

## 2. Technology & Service Map

- **Frontend:** Next.js 16.1.1 (App Router), React 19.2.3, TypeScript 5 (strict mode), Radix UI components, SWR (data fetching), Zustand (state management), Tailwind CSS
- **Backend:** Next.js serverless API routes (Node.js runtime on Vercel), Supabase Edge Functions (Deno runtime)
- **Infrastructure:** Vercel (IAD1 region, 30s function timeout), Supabase (PostgreSQL + Auth + Storage + Realtime), Vercel CDN
- **Database:** PostgreSQL via Supabase with Row-Level Security (RLS) on all 25+ tables
- **Authentication:** Supabase Auth (`@supabase/ssr 0.8.0`), HTTP-only session cookies
- **Encryption:** AES-256-GCM (`lib/secret-crypto.ts`) with SHA-256 key derivation from env var
- **External Services:** Meta Graph API (graph.facebook.com), Google Gemini API, OpenRouter API, OpenAI API, Resend (email)
- **Identified Subdomains:** No subdomains discovered (single-domain application at `host.docker.internal:3000`)
- **Open Ports & Services:**
  - Port 3000 — Next.js application (HTTP, primary attack surface)
  - Supabase services (internal, not directly accessible from external)
- **Publicly Accessible Pages:** `/`, `/login`, `/signup` (via tab), `/pricing`, `/terms`, `/privacy`, `/invite/[token]`

---

## 3. Authentication & Session Management Flow

### Entry Points
| Path | Method | Purpose |
|---|---|---|
| `/login` | GET | Login/signup page (Supabase Auth UI with email + password) |
| `/auth/callback` | GET | Supabase PKCE OAuth code exchange |
| `/api/auth/meta/login` | GET | Initiate Meta OAuth for social account connection |
| `/api/auth/meta/callback` | GET | Meta OAuth callback handler |
| `/api/auth/meta/page-session` | GET | Retrieve temporary OAuth session (page selection) |
| `/api/auth/meta/select-page` | POST | Complete OAuth by selecting Facebook page/Instagram account |
| `/api/auth/social/callback` | GET | Legacy OAuth (DISABLED — returns error redirect) |
| `/api/auth/social/connect/[platform]` | GET | Legacy connect (DISABLED — returns error redirect) |
| `/invite/[token]` | GET | Workspace invite acceptance page (public) |

### Mechanism

**Primary Authentication (Supabase Auth):**
1. User visits `/login` — email/password form or sign-up form (password min 10 chars, mixed case, number, symbol)
2. Credentials submitted directly to Supabase Auth (no custom auth endpoint — Supabase-managed)
3. Supabase redirects to `/auth/callback?code=<PKCE_code>`
4. `app/auth/callback/route.ts` line 14: calls `supabase.auth.exchangeCodeForSession(code)` — sets HTTP-only session cookies (Supabase JWT access token + refresh token)
5. Redirect validation at lines 8-10: `next` param must start with `/` but not `//` (prevents open redirect)
6. Next.js middleware (`proxy.ts`) runs on every request: creates Supabase client, refreshes session transparently, reads `active_workspace_id` cookie

**Meta OAuth (Social Account Connection, Not User Login):**
1. Authenticated user with `integrations:write` permission triggers `GET /api/auth/meta/login?workspaceId=<uuid>`
2. Route generates `crypto.randomUUID()` nonce, base64url-encodes JSON `{nonce, workspaceId, createdAt}`, sets `meta_oauth_state` httpOnly cookie (10-min TTL)
3. Redirects to Meta OAuth URL with scopes (pages_manage_posts, instagram_basic, etc.)
4. Meta redirects to `GET /api/auth/meta/callback?code=<code>&state=<base64url>`
5. Callback validates: state vs cookie nonce, 10-minute freshness, `integrations:write` permission on embedded workspaceId
6. Server-side code exchange for tokens; tokens encrypted via AES-256-GCM before any storage
7. Page/account data stored in `oauth_page_sessions` with 10-min TTL; raw tokens excluded from client responses

### Code Pointers
- Session refresh/cookie management: `proxy.ts` lines 13-36, `utils/supabase/server.ts` lines 4-36
- Auth code exchange: `app/auth/callback/route.ts` line 14
- RBAC enforcement: `lib/workspace-permissions.ts` lines 43-60 (`requireWorkspacePermission`)
- Role mapping: `lib/workspace-rbac.ts` lines 3-20
- Meta OAuth initiation: `app/api/auth/meta/login/route.ts` lines 34-67
- Meta OAuth callback: `app/api/auth/meta/callback/route.ts` lines 85-315

### 3.1 Role Assignment Process

- **Role Determination:** Roles are assigned at workspace membership time (not at Supabase Auth level). Stored in `workspace_members(workspace_id, user_id, role)` table.
- **Default Role:** N/A — no default role for new registrations. Roles are only assigned when joining a workspace.
  - Creating a workspace: `owner` role auto-assigned (`app/actions/workspace.ts` lines 49-55)
  - Accepting an invite: role from invite record (`app/actions/team-members.ts` lines 434-445); invite roles restricted to `admin | editor | viewer` (owner not grantable via invite)
- **Role Upgrade Path:**
  - Only workspace `owner` can change member roles (`requireWorkspaceManageRole` locks to `["owner"]` in `team-members.ts` lines 64-87)
  - Owner role cannot be modified post-creation (type enforced at line 317)
  - No self-service role escalation path
- **Code Implementation:** `app/actions/team-members.ts` (role management), `app/actions/workspace.ts` (workspace creation with owner assignment)

### 3.2 Privilege Storage & Validation

- **Storage Location:** Role stored in `workspace_members.role` column (PostgreSQL/Supabase). Session data is Supabase-managed JWTs in HTTP-only cookies — no custom JWT claims for roles.
- **Validation Points:** Every API request calls `supabase.auth.getUser()` (validates JWT with Supabase server), then queries `workspace_members` for the user's role, then checks against the RBAC permission map.
- **Cache/Session Persistence:** Supabase access tokens are short-lived; refresh handled transparently by `proxy.ts` middleware on every request. No application-layer role caching.
- **Code Pointers:**
  - `lib/workspace-permissions.ts` lines 29-60: `getWorkspaceRoleForUser()` + `requireWorkspacePermission()`
  - `utils/supabase/server.ts`: server-side Supabase client with cookie management
  - `proxy.ts` lines 37-46: session validation in middleware

### 3.3 Role Switching & Impersonation

- **Impersonation Features:** None identified — no admin impersonation mechanism exists in the codebase.
- **Role Switching:** No temporary privilege elevation ("sudo mode") mechanism.
- **Audit Trail:** No security event logging or audit trail for role changes (only `console.log` statements throughout).
- **Code Implementation:** N/A — these features are absent.

---

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible endpoints via the deployed Next.js application. Excluded: local scripts, CLI tools, migration files.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|---|---|---|---|---|---|
| GET | `/api/recommend-timeslots` | **none** | None | None | Returns static time slot recommendations. `app/api/recommend-timeslots/route.ts` |
| GET | `/api/recommend-next-slot` | **none** | None | None | Returns next-hour start time. `app/api/recommend-next-slot/route.ts` |
| POST | `/api/ai/validate-key` | **none** | None | **None — UNAUTHENTICATED** | Validates OpenRouter/OpenAI/Gemini API keys via outbound fetch. `app/api/ai/validate-key/route.ts` |
| POST | `/api/automations/validate` | **none** | None | **None — UNAUTHENTICATED** | Graph validation (BFS/DFS on workflow_graph). Stateless. `app/api/automations/validate/route.ts` |
| GET | `/api/webhooks/instagram` | none (token) | None | `hub.verify_token` env var match | Meta webhook verification handshake. `app/api/webhooks/instagram/route.ts` |
| POST | `/api/webhooks/instagram` | none (HMAC) | entryId (Meta page ID) | HMAC-SHA256 `X-Hub-Signature-256` header | Meta webhook events (comments, messages, story mentions). `app/api/webhooks/instagram/route.ts` |
| GET | `/api/cron/scheduler` | none (secret) | None | `CRON_SECRET` bearer OR `x-vercel-cron` header | Triggers scheduled post processing. `app/api/cron/scheduler/route.ts` |
| POST | `/api/cron/scheduler` | none (secret) | None | `CRON_SECRET` bearer OR `x-vercel-cron` header | Same as GET. `app/api/cron/scheduler/route.ts` |
| GET | `/auth/callback` | none | None | Supabase PKCE code | Supabase auth code exchange. `app/auth/callback/route.ts` |
| GET | `/api/auth/meta/login` | integrations:write | workspaceId (query) | Bearer + `requireWorkspacePermission('integrations:write')` | Initiates Meta OAuth. `app/api/auth/meta/login/route.ts` |
| GET | `/api/auth/meta/callback` | integrations:write | workspaceId (in state cookie) | Bearer + `requireWorkspacePermission('integrations:write')` + state nonce | Meta OAuth callback. `app/api/auth/meta/callback/route.ts` |
| GET | `/api/auth/meta/page-session` | integrations:write | sessionId (query, UUID) | Bearer + `requireWorkspacePermission('integrations:write')` on DB-resolved workspace | Retrieve OAuth page session. `app/api/auth/meta/page-session/route.ts` |
| POST | `/api/auth/meta/select-page` | integrations:write | sessionId, selectedPageId (body) | Bearer + `requireWorkspacePermission('integrations:write')` | Completes Meta OAuth, stores encrypted token. `app/api/auth/meta/select-page/route.ts` |
| GET | `/api/auth/social/callback` | n/a | None | n/a (disabled) | Disabled legacy route. Returns error redirect. |
| GET | `/api/auth/social/connect/[platform]` | n/a | platform (URL) | n/a (disabled) | Disabled legacy route. Returns error redirect. |
| GET | `/api/posts-media` | workspace member | None | Bearer + workspace cookie (**NO RBAC check**) | Lists Meta media for workspace social account. `app/api/posts-media/route.ts` |
| GET | `/api/posts-media/comments` | workspace member | postId (query, Meta ID) | Bearer + workspace cookie (**NO RBAC check**) | Lists Meta post comments. `app/api/posts-media/comments/route.ts` |
| POST | `/api/posts-media/comments` | content:write | commentId (body, Meta ID) | Bearer + `requireWorkspacePermission('content:write')` | Reply to comment via Meta API. `app/api/posts-media/comments/route.ts` |
| DELETE | `/api/posts-media/comments` | content:write | commentId (query, Meta ID) | Bearer + `requireWorkspacePermission('content:write')` | Delete comment via Meta API. `app/api/posts-media/comments/route.ts` |
| PATCH | `/api/posts-media/comments` | content:write | commentId (body, Meta ID) | Bearer + `requireWorkspacePermission('content:write')` | Hide/unhide comment via Meta API. `app/api/posts-media/comments/route.ts` |
| GET | `/api/posts` | workspace:read (implied) | None | Bearer + workspace cookie | Lists workspace posts. `app/api/posts/route.ts` |
| POST | `/api/posts` | content:write | None | Bearer + `requireWorkspacePermission('content:write')` | Create post (with media URLs). `app/api/posts/route.ts` |
| PUT | `/api/posts` | content:write | id (body, post UUID) | Bearer + `requireWorkspacePermission('content:write')` + workspace scope | Update post. `app/api/posts/route.ts` |
| PATCH | `/api/posts` | content:write | id (body, post UUID) | Bearer + `requireWorkspacePermission('content:write')` + workspace scope | Reschedule post. `app/api/posts/route.ts` |
| GET | `/api/automations` | workspace:read | None | Bearer + `requireWorkspacePermission('workspace:read')` | List automations. `app/api/automations/route.ts` |
| POST | `/api/automations` | automation:write | social_account_id (body) | Bearer + `requireWorkspacePermission('automation:write')` + account ownership | Create automation workflow. `app/api/automations/route.ts` |
| GET | `/api/automations/[id]` | workspace:read | id (URL, automation UUID) | Bearer + `requireWorkspacePermission('workspace:read')` + workspace scope | Get automation. `app/api/automations/[id]/route.ts` |
| PUT | `/api/automations/[id]` | automation:write | id (URL), social_account_id (body) | Bearer + `requireWorkspacePermission('automation:write')` + workspace scope | Update automation graph. `app/api/automations/[id]/route.ts` |
| DELETE | `/api/automations/[id]` | automation:write | id (URL, automation UUID) | Bearer + `requireWorkspacePermission('automation:write')` + workspace scope | Delete automation. `app/api/automations/[id]/route.ts` |
| POST | `/api/automations/[id]/toggle` | automation:write | id (URL, automation UUID) | Bearer + `requireWorkspacePermission('automation:write')` + workspace scope | Toggle automation active state. `app/api/automations/[id]/toggle/route.ts` |
| GET | `/api/automations/social-accounts` | workspace member | None | Bearer + workspace cookie (**NO RBAC check**) | List social accounts for automations. `app/api/automations/social-accounts/route.ts` |
| GET | `/api/automations/instagram-accounts` | workspace member | None | Bearer + workspace cookie (**NO RBAC check**) | List Instagram accounts. `app/api/automations/instagram-accounts/route.ts` |
| GET | `/api/automations/instagram-media` | workspace member | account_id (query, UUID) | Bearer + workspace cookie (**NO RBAC check**) + workspace scope on account_id | Instagram media for automation. `app/api/automations/instagram-media/route.ts` |
| GET | `/api/automations/media` | workspace member | account_id (query, UUID) | Bearer + workspace cookie (**NO RBAC check**) + workspace scope on account_id | Media for automations (IG+FB). `app/api/automations/media/route.ts` |
| POST | `/api/automations/process` | automation:write | automation_id (body, optional) | Bearer + `requireWorkspacePermission('automation:write')` | Trigger automation processing Edge Fn. `app/api/automations/process/route.ts` |
| GET | `/api/ai/generate-caption` | workspace member | workspaceId (body, optional) | Bearer + `getActiveWorkspace()` + workspace membership | AI caption generation. `app/api/ai/generate-caption/route.ts` |
| POST | `/api/ai/generate-ideas` | workspace member (weak) | None | `getActiveWorkspace()` null-guard only (**NO explicit auth check**) | AI content ideas. `app/api/ai/generate-ideas/route.ts` |
| GET | `/api/ai/models` | authenticated | None | Bearer + `getUser()` | List available AI models. `app/api/ai/models/route.ts` |
| POST | `/api/assistant/invoke` | workspace member | body.workspaceId (optional) | Bearer + workspace membership + function name allowlist | Invoke AI Edge Functions. `app/api/assistant/invoke/route.ts` |
| GET | `/api/analytics` | workspace member | None | Bearer + `getActiveWorkspace()` (**NO RBAC check**) | Retrieve analytics data. `app/api/analytics/route.ts` |
| POST | `/api/sync-analytics` | analytics:sync | None | Bearer + `requireWorkspacePermission('analytics:sync')` | Trigger analytics sync Edge Fn. `app/api/sync-analytics/route.ts` |
| GET | `/api/messages` | workspace:read | conversationId (query, optional) | Bearer + `requireWorkspacePermission('workspace:read')` | List messages/conversations. `app/api/messages/route.ts` |
| POST | `/api/messages` | content:write | conversationId (body) | Bearer + `requireWorkspacePermission('content:write')` + workspace scope | Send message via Meta API. `app/api/messages/route.ts` |
| GET | `/api/live-messages` | workspace member | conversationId (query, Meta ID) | Bearer + `getActiveWorkspace()` (**NO RBAC check**) | Live Meta DM fetch. `app/api/live-messages/route.ts` |
| POST | `/api/live-messages/send` | content:write | recipientId (body, Meta user ID) | Bearer + `requireWorkspacePermission('content:write')` | Send live DM via Meta API. `app/api/live-messages/send/route.ts` |
| GET | `/api/chat/sessions` | workspace:read | None | Bearer + `requireWorkspacePermission('workspace:read')` | List chat sessions. `app/api/chat/sessions/route.ts` |
| POST | `/api/chat/sessions` | content:write | None | Bearer + `requireWorkspacePermission('content:write')` | Create chat session. `app/api/chat/sessions/route.ts` |
| GET | `/api/chat/sessions/[id]` | workspace:read | id (URL, session UUID) | Bearer + `requireWorkspacePermission('workspace:read')` + workspace scope | Get chat session. `app/api/chat/sessions/[id]/route.ts` |
| PATCH | `/api/chat/sessions/[id]` | content:write | id (URL, session UUID) | Bearer + `requireWorkspacePermission('content:write')` + workspace scope | Update chat session. `app/api/chat/sessions/[id]/route.ts` |
| DELETE | `/api/chat/sessions/[id]` | content:write | id (URL, session UUID) | Bearer + `requireWorkspacePermission('content:write')` + workspace scope | Delete chat session. `app/api/chat/sessions/[id]/route.ts` |
| GET | `/api/brand-profile` | workspace:read | None | Bearer + `requireWorkspacePermission('workspace:read')` | Get brand profile. `app/api/brand-profile/route.ts` |
| PUT | `/api/brand-profile` | settings:write | None | Bearer + `requireWorkspacePermission('settings:write')` | Update brand profile. `app/api/brand-profile/route.ts` |
| GET | `/api/workspace/settings` | workspace:read | workspaceId (query, UUID) | Bearer + `requireWorkspacePermission('workspace:read')` | **Returns decrypted AI API keys.** `app/api/workspace/settings/route.ts` |
| PUT | `/api/workspace/settings` | settings:write | workspaceId (body) | Bearer + `requireWorkspacePermission('settings:write')` | Update workspace settings, encrypt API keys. `app/api/workspace/settings/route.ts` |
| GET | `/api/external-services` | settings:write | workspaceId (query) | Bearer + `requireWorkspacePermission('settings:write')` | List external services. `app/api/external-services/route.ts` |
| POST | `/api/external-services` | settings:write | workspaceId (body) | Bearer + `requireWorkspacePermission('settings:write')` | Create external service credential. `app/api/external-services/route.ts` |
| PUT | `/api/external-services/[id]` | settings:write | id (URL, svc UUID), workspaceId (body) | Bearer + `requireWorkspacePermission('settings:write')` + service ownership | Update service credential. `app/api/external-services/[id]/route.ts` |
| DELETE | `/api/external-services/[id]` | settings:write | id (URL, svc UUID), workspaceId (query) | Bearer + `requireWorkspacePermission('settings:write')` + workspace scope | Delete service credential. `app/api/external-services/[id]/route.ts` |
| GET | `/api/brand/social-status` | workspace:read | workspaceId (query) | Bearer + `requireWorkspacePermission('workspace:read')` | Social connection status. `app/api/brand/social-status/route.ts` |
| DELETE | `/api/brand/social-accounts` | integrations:write | workspaceId (query), platform (query) | Bearer + `requireWorkspacePermission('integrations:write')` | Disconnect social account. `app/api/brand/social-accounts/route.ts` |
| GET | `/api/test-db` | n/a | None | n/a (returns 404) | Disabled debug endpoint. `app/api/test-db/route.ts` |

**Server Actions (form-invoked, CSRF-protected by Next.js):**
| Action | File | Auth | Key Inputs |
|---|---|---|---|
| `createWorkspace` | `app/actions/workspace.ts` | Session | `name` |
| `renameWorkspace` | `app/actions/workspace.ts` | Session + owner role | `workspaceId`, `newName` |
| `deleteWorkspace` | `app/actions/workspace.ts` | Session + owner role | `workspaceId` |
| `leaveWorkspace` | `app/actions/workspace.ts` | Session | `workspaceId` |
| `switchWorkspace` | `app/actions/workspace.ts` | Session + membership | `workspaceId` |
| `createWorkspaceInvite` | `app/actions/team-members.ts` | Session + owner role | `workspaceId`, `email`, `role` |
| `revokeWorkspaceInvite` | `app/actions/team-members.ts` | Session + owner role | `workspaceId`, `inviteId` |
| `updateWorkspaceMemberRole` | `app/actions/team-members.ts` | Session + owner role | `workspaceId`, `memberId`, `role` |
| `removeWorkspaceMember` | `app/actions/team-members.ts` | Session + owner role | `workspaceId`, `memberId` |
| `acceptWorkspaceInvite` | `app/actions/team-members.ts` | Session | `token` (invite token) |
| `getWorkspaceInvitePreview` | `app/actions/team-members.ts` | **None (public)** | `token` (invite token) |
| `getWorkspaceSettings` | `app/actions/settings.ts` | **NO AUTH CHECK — relies on RLS** | `workspaceId` |
| `updateWorkspaceSettings` | `app/actions/settings.ts` | Session + settings:write | `workspaceId`, settings object |
| `generateIdeasAction` | `app/actions/ai.ts` | Workspace cookie only | `topic`, `platform` |
| `chatAction` | `app/actions/ai.ts` | Workspace cookie only | `messages[]` |
| `signOut` | `app/actions/auth.ts` | Session | None |
| `createPostAction` | `app/actions/posts.ts` | Session + workspace lookup | `content`, `platforms`, `action` |

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All vectors below are reachable through HTTP requests to the deployed Next.js application.

### URL Parameters (Query String)
- `workspaceId` — `GET /api/workspace/settings`, `GET /api/brand/social-status`, `DELETE /api/brand/social-accounts` (UUID format, permission-checked)
- `platform` — `GET /api/automations/social-accounts`, `GET /api/live-messages`, `DELETE /api/brand/social-accounts` (no allowlist in some routes)
- `postId` — `GET/POST/DELETE/PATCH /api/posts-media/comments` — **NOT validated as numeric Meta ID; injected into Meta Graph API URL path** (`app/api/posts-media/comments/route.ts` lines 74, 115, 145)
- `commentId` — `DELETE/PATCH /api/posts-media/comments` — **NOT validated; injected into Meta Graph API URL** (`app/api/posts-media/comments/route.ts` lines 303-304, 376, 335, 410)
- `account_id` — `GET /api/automations/instagram-media`, `GET /api/automations/media` (UUID validated, workspace-scoped)
- `conversationId` — `GET /api/messages` (optional; workspace-scoped DB query but UPDATE lacks workspace filter at `app/api/messages/route.ts` lines 58-66)
- `sessionId` — `GET /api/auth/meta/page-session` (UUID validated via `sanitizeMetaPageSessionId`)
- `provider` — `POST /api/ai/validate-key` (no allowlist; falls through to Gemini if unknown)
- `limit` — `GET /api/automations/instagram-media`, `GET /api/automations/media` (integer)
- `after` — `GET /api/posts-media` (pagination cursor, passed to Meta API)
- `hub.verify_token`, `hub.challenge`, `hub.mode` — `GET /api/webhooks/instagram`
- `code`, `state`, `error`, `error_description` — `GET /api/auth/meta/callback`

### POST Body Fields (JSON)
- `provider`, `apiKey` — `POST /api/ai/validate-key` (unauthenticated; `apiKey` passed to Authorization header — header injection risk)
- `workflow_graph` — `POST /api/automations`, `PUT /api/automations/[id]`, `POST /api/automations/validate` — **entire graph written to DB without sanitization**; node configs include `config.url`, `config.method`, `config.headers`, `config.body` which flow to SSRF sink
- `name`, `platform_post_id`, `post_thumbnail_url`, `post_caption`, `trigger_config`, `comment_reply_config`, `dm_config` — `POST /api/automations` — **no sanitization**; `platform_post_id` injected into Meta Graph API URL (`app/api/automations/route.ts` line 242)
- `social_account_id` — `POST /api/automations` (UUID, workspace-scoped)
- `platforms[]`, `captionByPlatform`, `mediaUrls[]`, `status`, `scheduledAt` — `POST /api/posts`; `mediaUrls` allows `data:` URI bypass up to 8 MB (`lib/security/phase1-validation.ts` line 352)
- `recipientId`, `message`, `platform` — `POST /api/live-messages/send` — **no format validation on `recipientId`; passed directly to Meta API**
- `conversationId`, `message` — `POST /api/messages`
- `commentId`, `message`, `platform` — `POST /api/posts-media/comments` — **`commentId` not validated as numeric Meta ID; injected into URL**
- `functionName`, `body` — `POST /api/assistant/invoke` (functionName allowlisted; body forwarded to Edge Function)
- `workspaceId`, `settings.*` (including `openrouter_api_key`, `gemini_api_key`, `openai_api_key`, `timezone`, `default_language`, `ai_text_model_name`, `ai_image_model_name`) — `PUT /api/workspace/settings`; `timezone` and model names not format-validated
- `workspaceId`, `service_name`, `website`, `email`, `password`, `api_key`, `subscription_tier`, `price` — `POST/PUT /api/external-services` (passwords/API keys encrypted at rest)
- `description`, `platforms[]`, `tone`, `language`, `workspaceId` — `POST /api/ai/generate-caption`
- `topic`, `platform` — `POST /api/ai/generate-ideas` (flows to LLM prompt — prompt injection)
- `messages[]`, `title` — `POST/PATCH /api/chat/sessions` and `/api/chat/sessions/[id]`; `messages[].type` has no allowlist (just length-capped)
- `business_name`, `owner_name`, `email`, `phone`, `website`, `industry`, `business_description`, `target_audience`, `brand_voice`, `services[]`, `unique_selling_points[]`, `logo_url`, `brand_colors[]`, `reference_image_urls[]`, `instagram_handle`, `facebook_page`, `content_themes[]` — `PUT /api/brand-profile`
- `sessionId`, `selectedPageId` — `POST /api/auth/meta/select-page`
- `is_active`, `name`, `trigger_config`, `comment_reply_config`, `dm_config`, `workflow_graph`, `editor_version` — `PUT /api/automations/[id]`
- `automation_id` — `POST /api/automations/process` (optional; passed to Edge Fn without pre-flight ownership check)
- Webhook event body — `POST /api/webhooks/instagram` (HMAC-verified; but `entryId`, `senderId`, `commentText`, `messageText` flow into automation context and LLM prompts — prompt injection)

### HTTP Headers
- `X-Hub-Signature-256` — `POST /api/webhooks/instagram` (HMAC verification input)
- `Authorization: Bearer <CRON_SECRET>` — `GET/POST /api/cron/scheduler`
- `x-vercel-cron` — `GET/POST /api/cron/scheduler` (Vercel cron bypass header)
- `Cookie: active_workspace_id` — all authenticated routes (workspace resolution; httpOnly but value controls which workspace is accessed)
- `Cookie: meta_oauth_state` — `GET /api/auth/meta/callback` (base64url-encoded JSON with nonce+workspaceId)
- `Content-Type` — body parsing decisions
- Standard Supabase session cookies (access token JWT, refresh token) — all authenticated routes

### Cookie Values
- `active_workspace_id` — **primary workspace resolution mechanism for most API routes**; set by middleware/switchWorkspace; httpOnly; value controls which workspace's data is accessed in routes using `getActiveWorkspace()`
- `meta_oauth_state` — contains base64url-encoded `{nonce, workspaceId, createdAt}`; validated in OAuth callback
- Supabase auth session cookies — JWT access and refresh tokens; httpOnly; Supabase-managed

---

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|---|---|---|---|---|---|
| UserBrowser | Identity | Internet | Browser/React 19 | PII | End user interacting with the SwiftFlow UI |
| SwiftFlowApp | Service | App | Next.js 16/Node.js + Vercel | PII, Tokens, Secrets | Main application server — serves UI and API routes |
| SupabaseDB | DataStore | Data | PostgreSQL (Supabase) | PII, Tokens, Secrets | Primary data store; 25+ tables with RLS; stores encrypted Meta tokens, AI API keys, workspace data |
| SupabaseAuth | Service | Data | Supabase Auth | PII, Tokens | JWT-based authentication provider; manages user sessions |
| SupabaseEdgeFunctions | Service | App | Deno (Supabase Edge) | PII, Tokens, Secrets | 12 Edge Functions: AI generation, automation orchestration, post publishing, email sending |
| SupabaseStorage | DataStore | Data | Supabase Storage | Public | Stores post media and generated assets; public read, auth-required upload |
| MetaGraphAPI | ThirdParty | ThirdParty | REST/HTTPS (graph.facebook.com) | PII, Tokens | Instagram + Facebook publishing, messaging, comments, analytics |
| GoogleGeminiAPI | ThirdParty | ThirdParty | REST/HTTPS (generativelanguage.googleapis.com) | Secrets | AI text/image generation |
| OpenRouterAPI | ThirdParty | ThirdParty | REST/HTTPS (openrouter.ai) | Secrets | AI model routing/proxy |
| OpenAIAPI | ThirdParty | ThirdParty | REST/HTTPS (api.openai.com) | Secrets | AI capabilities |
| ResendAPI | ThirdParty | ThirdParty | REST/HTTPS (resend.com) | PII | Email delivery for workspace invitations |
| VercelCDN | ExternAsset | Edge | Vercel Edge Network | Public | CDN and DDoS protection; no custom security headers configured |
| AutomationWorkerSSRF | Service | App | Deno (Supabase Edge) | Secrets | **CRITICAL: `automation-worker-http-request` — unrestricted fetch() to any URL** |

### 6.2 Entity Metadata

| Title | Metadata Key: Value |
|---|---|
| SwiftFlowApp | Hosts: `http://host.docker.internal:3000`; Auth: Supabase JWT cookies + `active_workspace_id` cookie; Runtime: Node.js/Vercel serverless; Timeout: 30s; Region: IAD1; Config: `vercel.json`, `next.config.ts` |
| SupabaseDB | Engine: PostgreSQL (Supabase managed); Exposure: Internal only; RLS: Enabled on all 25+ tables; Consumers: SwiftFlowApp (service role key), SupabaseEdgeFunctions; Sensitive tables: `workspace_settings`, `social_accounts`, `external_services`, `workspace_members`, `oauth_page_sessions` |
| SupabaseAuth | Token Format: JWT; Session: HTTP-only cookies; Refresh: Transparent via `proxy.ts` middleware; No custom JWT claims for roles |
| SupabaseEdgeFunctions | Runtime: Deno; CORS: `Access-Control-Allow-Origin: *` on orchestrator; Invoked by: SwiftFlowApp via service role key; Functions: generate-caption, chat-assistant, generate-image, generate-ideas, generate-carousel, generate-reply, generate-message-reply, process-scheduled-posts, process-automations, process-scheduled-executions, automation-orchestrator, automation-worker-http-request, sync-analytics, send-invite-email |
| AutomationWorkerSSRF | SSRF Sink: `fetch(String(config.url || ''), options)` at `supabase/functions/automation-worker-http-request/index.ts:29`; No URL validation; Controllable: URL, method, headers, body |
| MetaGraphAPI | Base URL: `https://graph.facebook.com/v20.0`; Auth: page access tokens (AES-256-GCM encrypted in DB); Scope: pages_manage_posts, instagram_basic, pages_messaging, instagram_manage_comments, etc. |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|---|---|---|---|---|
| UserBrowser → SwiftFlowApp | HTTP | `:3000 /` (landing, login, pricing) | None | Public |
| UserBrowser → SwiftFlowApp | HTTP | `:3000 /invite/[token]` | None | Public (invite preview) |
| UserBrowser → SwiftFlowApp | HTTP | `:3000 /api/ai/validate-key` | **None** | Secrets (API keys) |
| UserBrowser → SwiftFlowApp | HTTP | `:3000 /api/automations/validate` | **None** | Public (graph structure) |
| UserBrowser → SwiftFlowApp | HTTP | `:3000 /api/recommend-*` | None | Public (static data) |
| UserBrowser → SupabaseAuth | HTTPS | Supabase Auth endpoint | None → PKCE | Tokens |
| SupabaseAuth → SwiftFlowApp | HTTPS | `:3000 /auth/callback` | PKCE code | Tokens |
| UserBrowser → SwiftFlowApp | HTTP | `:3000 /dashboard/*` | auth:user + workspace cookie | PII |
| UserBrowser → SwiftFlowApp | HTTP | `:3000 /api/posts` | auth:user + content:write | PII |
| UserBrowser → SwiftFlowApp | HTTP | `:3000 /api/automations` | auth:user + automation:write | PII, Secrets |
| UserBrowser → SwiftFlowApp | HTTP | `:3000 /api/workspace/settings` | auth:user + workspace:read | **Secrets (decrypted API keys returned)** |
| UserBrowser → SwiftFlowApp | HTTP | `:3000 /api/live-messages` | auth:user (**no RBAC**) | PII (DMs) |
| UserBrowser → SwiftFlowApp | HTTP | `:3000 /api/analytics` | auth:user (**no RBAC**) | PII |
| MetaGraphAPI → SwiftFlowApp | HTTPS | `:3000 /api/webhooks/instagram` | HMAC-SHA256 signature | PII (comments, DMs) |
| VercelCron → SwiftFlowApp | HTTPS | `:3000 /api/cron/scheduler` | CRON_SECRET bearer | Internal |
| SwiftFlowApp → SupabaseDB | TCP | Supabase API (HTTPS) | service role key (bypasses RLS) or user JWT (RLS enforced) | PII, Tokens, Secrets |
| SwiftFlowApp → SupabaseEdgeFunctions | HTTPS | Supabase Edge URL | service role key | PII, Tokens, Secrets |
| SwiftFlowApp → MetaGraphAPI | HTTPS | graph.facebook.com | page access token | PII, Tokens |
| SwiftFlowApp → GoogleGeminiAPI | HTTPS | generativelanguage.googleapis.com | workspace AI API key | Secrets |
| SwiftFlowApp → OpenRouterAPI | HTTPS | openrouter.ai | workspace AI API key | Secrets |
| SwiftFlowApp → ResendAPI | HTTPS | resend.com | RESEND_API_KEY | PII (email addresses) |
| AutomationWorkerSSRF → AnyHost | HTTP/HTTPS | **Any URL** | **None** | **SSRF — any internal/external resource** |
| SupabaseEdgeFunctions → MetaGraphAPI | HTTPS | graph.facebook.com | page access token (decrypted) | PII, Tokens |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|---|---|---|
| auth:user | Auth | Requires a valid Supabase JWT session cookie. Validated via `supabase.auth.getUser()` on every API request. Missing = 401. |
| auth:workspace | Auth | Requires a valid `active_workspace_id` cookie that maps to a workspace the user is a member of. Validated via `getActiveWorkspace()`. Missing = 404/redirect. |
| rbac:workspace:read | Authorization | Requires at minimum `viewer` role in workspace. Enforced via `requireWorkspacePermission(..., 'workspace:read')` in `lib/workspace-permissions.ts:43`. |
| rbac:content:write | Authorization | Requires at minimum `editor` role. Blocks `viewer`. Enforced via `requireWorkspacePermission(..., 'content:write')`. |
| rbac:automation:write | Authorization | Requires `admin` or `owner` role. Blocks `editor` and `viewer`. Enforced via `requireWorkspacePermission(..., 'automation:write')`. |
| rbac:settings:write | Authorization | Requires `admin` or `owner` role. Blocks `editor` and `viewer`. Enforced via `requireWorkspacePermission(..., 'settings:write')`. |
| rbac:integrations:write | Authorization | Requires `admin` or `owner` role. Blocks `editor` and `viewer`. Enforced via `requireWorkspacePermission(..., 'integrations:write')`. |
| rbac:analytics:sync | Authorization | Requires `admin` or `owner` role. Enforced via `requireWorkspacePermission(..., 'analytics:sync')`. |
| rbac:members:manage | Authorization | Requires `owner` role only. Enforced via `requireWorkspaceManageRole(workspaceId, ["owner"])` in `app/actions/team-members.ts:64`. |
| ownership:workspace | ObjectOwnership | Verifies user's role in the target workspace before accessing workspace-scoped objects. Workspace ID from cookie or request body, verified via `workspace_members` table lookup. |
| ownership:object | ObjectOwnership | Verifies a specific object (automation, chat session, external service) belongs to the active workspace by including `.eq('workspace_id', activeWorkspace.id)` in DB queries. |
| cron:secret | Auth | Shared secret (`CRON_SECRET` env var) in `Authorization: Bearer` header OR Vercel `x-vercel-cron` header. No user session required. `app/api/cron/scheduler/route.ts`. |
| webhook:hmac | Auth | HMAC-SHA256 of raw request body using `META_APP_SECRET` env var, compared via timing-safe `crypto.timingSafeEqual()`. `app/api/webhooks/instagram/route.ts`. |
| meta:oauth:state | Protocol | base64url-encoded JSON `{nonce, workspaceId, createdAt}` in httpOnly cookie `meta_oauth_state`; 10-minute TTL; validated in OAuth callback against query `state` param. |
| missing:rbac | Authorization | **Absence of guard** — routes where only workspace membership is checked (not role). Affects: `GET /api/live-messages`, `GET /api/posts-media`, `GET /api/posts-media/comments`, `GET /api/analytics`, `GET /api/automations/*` (social-accounts, instagram-accounts, instagram-media, media). Viewer role can access these endpoints. |
| none | Auth | **No authentication** — `POST /api/ai/validate-key`, `POST /api/automations/validate`, `GET /api/recommend-*`. Accessible to anonymous internet users. |

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|---|---|---|---|
| anon | 0 | Global | No authentication — unauthenticated requests |
| viewer | 1 | Workspace | `workspace_members.role = 'viewer'`; checked in `lib/workspace-rbac.ts` |
| editor | 2 | Workspace | `workspace_members.role = 'editor'`; checked in `lib/workspace-rbac.ts` |
| admin | 3 | Workspace | `workspace_members.role = 'admin'`; checked in `lib/workspace-rbac.ts` |
| owner | 4 | Workspace | `workspace_members.role = 'owner'`; exclusive to workspace creator; checked in `lib/workspace-rbac.ts` + `app/actions/team-members.ts:64` |
| cron | N/A | System | CRON_SECRET bearer token; not a user role — system service identity |
| webhook | N/A | System | HMAC-SHA256 signed by META_APP_SECRET; not a user role — Meta identity |

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anon → (no workspace access)
viewer → workspace:read (read workspace data, analytics, posts, chats)
editor → content:write (+ viewer; create/edit posts, messages, chat sessions)
admin → automation:write, settings:write, integrations:write, analytics:sync (+ editor; connect social accounts, manage automations, workspace settings)
owner → members:manage (+ admin; manage team members, invite/remove, rename/delete workspace)

Vertical escalation order:
anon < viewer < editor < admin < owner

Parallel Isolation:
owner in workspace A || owner in workspace B (completely isolated workspaces)
admin in workspace A has no privileges in workspace B

Owner is immutable post-creation — cannot be transferred or changed via API.
Invited roles restricted to: admin, editor, viewer (never owner).
```

**Role Switching:** None — no impersonation, no sudo mode, no temporary role elevation.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|---|---|---|---|
| anon | `/` | `/`, `/login`, `/pricing`, `/terms`, `/privacy`, `/invite/[token]` | None |
| viewer | `/dashboard` (or `/dashboard/onboarding`) | `/dashboard/*`, `/api/workspace/settings` (GET), `/api/messages` (GET), `/api/chat/sessions/*` (GET), `/api/brand-profile` (GET), `/api/brand/social-status`, `/api/analytics`\*, `/api/live-messages`\*, `/api/posts-media`\*, `/api/automations/*` (GET)\* | Supabase JWT session cookie |
| editor | `/dashboard` | All viewer routes + `/api/posts` (POST/PUT/PATCH), `/api/messages` (POST), `/api/chat/sessions/*` (POST/PATCH/DELETE), `/api/posts-media/comments` (POST/DELETE/PATCH), `/api/live-messages/send` | Supabase JWT session cookie |
| admin | `/dashboard` | All editor routes + `/api/automations` (POST/PUT/DELETE/toggle), `/api/workspace/settings` (PUT), `/api/external-services` (all), `/api/brand/social-accounts` (DELETE), `/api/auth/meta/*`, `/api/sync-analytics` | Supabase JWT session cookie |
| owner | `/dashboard` | All admin routes + workspace rename/delete, team member management, invite management | Supabase JWT session cookie |

\* These routes lack explicit RBAC checks — effectively accessible to any authenticated workspace member regardless of role.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|---|---|---|---|
| viewer | `proxy.ts` auth check | `requireWorkspacePermission(..., 'workspace:read')` — `lib/workspace-permissions.ts:43` | `workspace_members.role = 'viewer'` (PostgreSQL) |
| editor | `proxy.ts` auth check | `requireWorkspacePermission(..., 'content:write')` | `workspace_members.role = 'editor'` |
| admin | `proxy.ts` auth check | `requireWorkspacePermission(..., 'automation:write'/'settings:write'/'integrations:write'/'analytics:sync')` | `workspace_members.role = 'admin'` |
| owner | `proxy.ts` auth check | `requireWorkspaceManageRole(workspaceId, ["owner"])` in `team-members.ts:64` + all admin permissions | `workspace_members.role = 'owner'` |

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|---|---|---|---|---|
| High | `GET /api/messages?conversationId={id}` | conversationId (Meta conversation ID — external ID not tied to workspace) | PII (DMs/messages) | Cross-workspace conversation access if conversationId known; UPDATE operations at `messages/route.ts:58-66` lack workspace filter |
| High | `GET /api/workspace/settings?workspaceId={uuid}` | workspaceId | Secrets (decrypted AI API keys) | Caller-supplied workspaceId with permission check; if permission bypass found, full secrets exposure |
| High | `GET /api/external-services?workspaceId={uuid}` | workspaceId | Secrets (passwords, API keys) | Caller-supplied workspaceId; requires settings:write but secrets returned |
| High | `PUT /api/external-services/{id}` | id (service UUID), workspaceId (body) | Secrets | workspaceId from request body — mismatched id/workspaceId could leak or corrupt |
| Medium | `GET /api/chat/sessions/{id}` | id (session UUID) | user_data (chat history) | workspace-scoped; test if id from another workspace accessible |
| Medium | `GET /api/automations/{id}` | id (automation UUID) | automation config (workflow graph with HTTP nodes) | workspace-scoped; test cross-workspace automation access |
| Medium | `GET /api/live-messages?conversationId={id}` | conversationId (Meta external ID) | PII (live DMs) | No RBAC check; conversationId is Meta-external; token-scoped but no RBAC |
| Medium | `POST /api/messages` with arbitrary `conversationId` | conversationId | PII (message sending) | workspace-scoped on fetch but cross-tenant conversationId UPDATE vulnerability |
| Low | `GET /api/automations/instagram-media?account_id={uuid}` | account_id (social account UUID) | Social media (tokens) | workspace-scoped; verify |

### 8.2 Vertical Privilege Escalation Candidates

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|---|---|---|---|
| admin/owner | `POST /api/automations` | Create automation workflow with HTTP request nodes (SSRF) | Critical |
| admin/owner | `PUT /api/automations/{id}` | Update automation workflow_graph — overwrite stored SSRF payload | Critical |
| admin/owner | `GET /api/workspace/settings` | Retrieve decrypted AI API keys | High |
| admin/owner | `PUT /api/workspace/settings` | Overwrite AI provider configuration and API keys | High |
| admin/owner | `DELETE /api/brand/social-accounts` | Disconnect social accounts (destructive) | High |
| admin/owner | `POST /api/auth/meta/login` | Initiate social account OAuth connection | High |
| admin/owner | `POST /api/sync-analytics` | Trigger analytics sync (Edge Function invocation) | Medium |
| admin/owner | `POST /api/external-services` | Store service credentials in workspace | High |
| owner | Team member management Server Actions | `createWorkspaceInvite`, `updateWorkspaceMemberRole`, `removeWorkspaceMember`, `revokeWorkspaceInvite` | High |
| owner | `renameWorkspace`, `deleteWorkspace` Server Actions | Destructive workspace operations | High |
| system | `POST /api/cron/scheduler` | Trigger post publishing and automation execution | High |

### 8.3 Context-Based Authorization Candidates

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|---|---|---|---|
| Meta OAuth | `POST /api/auth/meta/select-page` | `GET /api/auth/meta/login` → Meta OAuth → `GET /api/auth/meta/callback` must complete first; `sessionId` stored in `oauth_page_sessions` | Direct POST with guessed/expired `sessionId` to try to re-use or replay page selection |
| Meta OAuth | `GET /api/auth/meta/page-session?sessionId={uuid}` | Session stored by callback handler; 10-min TTL | UUID brute-force on `oauth_page_sessions` table; entropy=128 bits — infeasible but test for timing |
| Automation execution | `POST /api/automations/process` | Automation must exist and belong to workspace; `automation_id` passed without pre-flight ownership check | Pass `automation_id` from another workspace — Edge Function receives it with workspace_id separately; race between validation |
| Invite acceptance | `acceptWorkspaceInvite(token)` | Token generated by owner, sent via email; email must match logged-in user | Attempt to accept with different authenticated user (blocked by email check at `team-members.ts:419`); test for token enumeration (2x UUID = 64 hex chars) |
| Workspace settings Server Action | `getWorkspaceSettings(workspaceId)` | **No auth check** — relies on Supabase RLS | Direct Server Action invocation with arbitrary workspaceId; if RLS misconfigured, arbitrary workspace settings readable |
| Automation worker SSRF | Automation HTTP request node execution | User must create automation with HTTP node type; node must be invoked by orchestrator | If automation is active, the SSRF executes on every trigger event (webhook comment, message, etc.) — no user interaction required after setup |

---

## 9. Injection Sources

### Critical Injection Sources

**1. SSRF — `automation-worker-http-request` Edge Function**
- **File:** `supabase/functions/automation-worker-http-request/index.ts`, line 29
- **Input vector:** HTTP POST body — `config.url`, `config.method`, `config.headers`, `config.body`
- **Data flow:** `POST /api/automations` (body: `workflow_graph.nodes[].config.url`) → stored in `automations` table → `automation-orchestrator` Edge Function reads graph → invokes `automation-worker-http-request` with node config → `fetch(String(config.url || ''), options)` at line 29
- **Sink:** Deno `fetch()` — unrestricted HTTP/HTTPS to any host
- **No validation:** No URL scheme check, no private IP blocking, no domain allowlist, no port restriction
- **Attack scenarios:** AWS IMDS (`http://169.254.169.254/`), GCP metadata (`http://metadata.google.internal/`), internal Supabase services, internal network scanning

**2. Meta Graph API URL Path Injection (platform_post_id)**
- **File:** `app/api/automations/route.ts`, line 242
- **Input vector:** HTTP POST body field `platform_post_id`
- **Data flow:** `POST /api/automations` body → `platform_post_id` (not validated as numeric ID) → `\`${META_GRAPH_API_BASE_URL}/${platform_post_id}/comments?...\`` → `fetch(testUrl)`
- **Sink:** Outbound `fetch()` to Meta Graph API with attacker-controlled URL path segment
- **Attack scenarios:** `platform_post_id = "123/../me?fields=email"` → access arbitrary Meta Graph endpoints

**3. Meta Graph API URL Path Injection (postId, commentId)**
- **File:** `app/api/posts-media/comments/route.ts`, lines 115, 145, 247, 335, 410
- **Input vector:** Query param `postId`; body/query `commentId`
- **Data flow:** HTTP request params → directly interpolated into Meta Graph API URL path → `fetch(url)`
- **Sink:** Outbound `fetch()` to Meta Graph API with attacker-controlled path
- **No format validation:** `postId` and `commentId` not validated as numeric Meta IDs

**4. Media URL SSRF via Meta Publishing (mediaUrls)**
- **File:** `utils/meta-publish.ts` (lines 123-168, 174-255, 265-378, 384-487, 492-537, 546-624); `supabase/functions/process-scheduled-posts/index.ts`
- **Input vector:** HTTP POST body `mediaUrls[]` in `POST /api/posts`
- **Data flow:** `POST /api/posts` body → `mediaUrls` stored in `posts` table → scheduler triggers `process-scheduled-posts` Edge Function → `image_url`/`video_url`/`file_url` passed to Meta Graph API → **Meta's servers fetch the user-supplied URL**
- **Sink:** Meta Graph API media fetching (blind SSRF via Meta as proxy)
- **Note:** `data:` URI bypass exists (`lib/security/phase1-validation.ts` line 352) — `data:` URIs up to 8 MB accepted without MIME validation; passed to Meta API as image URL (Meta will reject but bypass is notable)

**5. Prompt Injection — Webhook Comment/Message Text**
- **File:** `supabase/functions/_shared/automation-context.ts`, lines 48-49, 88-98, 118-120, 148-151
- **Input vector:** Instagram comment text, Instagram DM message text (from Meta webhooks → `POST /api/webhooks/instagram`)
- **Data flow:** Instagram user comments/messages → HMAC-verified webhook → automation context → `buildAutomationAiPrompt()` embeds `ctx.comment_text`/`ctx.message_text` unescaped in LLM task prompt → AI provider API call
- **Sink:** LLM prompt construction — attacker-controlled text appears in system/task context

**6. HTTP Header Injection via apiKey in validate-key**
- **File:** `app/api/ai/validate-key/route.ts`, lines 26-28
- **Input vector:** Unauthenticated HTTP POST body `apiKey`
- **Data flow:** `apiKey` trimmed → inserted into `Authorization: Bearer ${trimmedKey}` header → `fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: ... } })`
- **Sink:** HTTP request header — if `apiKey` contains `\r\n`, arbitrary headers injected into outbound request to OpenRouter/OpenAI
- **Example:** `apiKey = "sk-test\r\nX-Injected: evil"`

**7. Workflow Graph Data Written to DB Without Sanitization**
- **File:** `app/api/automations/route.ts` lines 131-305; `app/api/automations/[id]/route.ts` lines 94-119
- **Input vectors:** `name`, `trigger_config`, `comment_reply_config`, `dm_config`, `workflow_graph`, `post_caption`, `platform_post_id`, `post_thumbnail_url`
- **Data flow:** Request body → no sanitization via `phase1-validation.ts` → direct `supabase.from('automations').insert()/update()` → stored for later execution by automation orchestrator
- **Sink:** Database write + subsequent execution by Edge Functions; `workflow_graph` node configs (including HTTP URLs) executed by SSRF worker

**8. Template Injection in Email Worker**
- **File:** `supabase/functions/_shared/automation-context.ts` lines 27-34; `supabase/functions/automation-worker-send-email/index.ts` lines 43-44
- **Input vector:** Instagram comment/message text (from webhook)
- **Data flow:** Webhook event → `ctx.comment_text`/`ctx.message_text` → `interpolateTemplate(template, ctx)` → `{{comment_text}}` placeholder substitution → email subject/body
- **Sink:** Email subject line and body — comment text substituted verbatim into email sent via Resend API

**9. data: URI Bypass in mediaUrls**
- **File:** `lib/security/phase1-validation.ts`, line 352
- **Input vector:** HTTP POST body `mediaUrls[]` in `POST /api/posts`
- **Data flow:** `mediaUrls` validated by `sanitizeHttpUrl()` OR if starts with `data:` accepts up to 8 MB raw — bypasses URL validation entirely
- **Sink:** Database storage + Meta API publishing (Meta rejects data URIs but bypass is documented)
- **Attack value:** 8 MB arbitrary binary data storable per post, exfiltrable to anyone reading post media

**10. `conversationId` UPDATE Without Workspace Scope**
- **File:** `app/api/messages/route.ts`, lines 58-66
- **Input vector:** Query param `conversationId` in `GET /api/messages`
- **Data flow:** `conversationId` → `supabase.from('messages').update({ is_read: true }).eq('conversation_id', conversationId)` **without `.eq('workspace_id', ...)`** at line 58; also `supabase.from('conversations').update({ unread_count: 0 }).eq('id', conversationId)` without workspace filter at line 64
- **Sink:** Cross-tenant database UPDATE — marks another workspace's messages as read if RLS is not airtight
