# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Target:** SwiftFlow Social Media Manager AI Tool — `http://host.docker.internal:3000`
- **Key Outcome:** Four externally exploitable authorization vulnerabilities identified across horizontal, vertical, and context/workflow categories. All findings are code-backed with source-to-sink traces and have been passed to the exploitation phase via the machine-readable exploitation queue.
- **Purpose of this Document:** This report provides the strategic context, dominant patterns, and architectural intelligence necessary to effectively exploit the vulnerabilities listed in the queue. It is intended to be read alongside the JSON deliverable.

### Vulnerability Summary

| ID | Type | Endpoint / Component | Confidence | Severity |
|---|---|---|---|---|
| AUTHZ-VULN-01 | Horizontal | `GET /api/messages?conversationId` | High | High |
| AUTHZ-VULN-02 | Vertical | `GET/POST /api/cron/scheduler` | High | High |
| AUTHZ-VULN-03 | Vertical | `GET /api/workspace/settings` | Medium | Medium |
| AUTHZ-VULN-04 | Context/Vertical | `getWorkspaceSettings` Server Action | Medium | Medium |

---

## 2. Dominant Vulnerability Patterns

### Pattern 1: Missing Workspace Filter on Mutation Operations (Horizontal)
- **Description:** A database mutation operation (UPDATE) executes using only the caller-supplied `conversationId` parameter without binding the operation to the authenticated user's workspace. The SELECT that precedes it is correctly workspace-scoped, but the UPDATE is not.
- **Implication:** Any authenticated workspace member in Workspace A can silently mutate message state (mark as read, zero unread count) in Workspace B by supplying a known `conversationId` value.
- **Representative:** AUTHZ-VULN-01

### Pattern 2: Authorization Guard Dependent on Non-Validated Environment Variable (Vertical)
- **Description:** The cron scheduler endpoint's authorization logic has a conditional fallback: if `CRON_SECRET` environment variable is absent, it accepts any request that includes an `x-vercel-cron` HTTP header — regardless of the header's value. The `CRON_SECRET` variable is not present in any configured environment file.
- **Implication:** Unauthenticated external attackers can trigger privileged Edge Function invocations (post publishing, automation execution) by simply adding the `x-vercel-cron` header.
- **Representative:** AUTHZ-VULN-02

### Pattern 3: Insufficient Role Minimum for Sensitive Data Exposure (Vertical)
- **Description:** The `GET /api/workspace/settings` endpoint requires only `workspace:read` permission (minimum: `viewer` role — the lowest role), yet returns decrypted AI API keys (OpenRouter, Gemini, OpenAI) in its response. Additionally, the corresponding Server Action (`getWorkspaceSettings`) performs no explicit authentication or authorization check at all, relying solely on Supabase Row-Level Security.
- **Implication:** Any workspace member regardless of role can extract plaintext third-party AI API keys. The Server Action path removes the application-layer guard entirely.
- **Representative:** AUTHZ-VULN-03, AUTHZ-VULN-04

---

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture
- **Session Mechanism:** Supabase Auth with HTTP-only JWT cookies (access token + refresh token). The session is validated via `supabase.auth.getUser()` on every authenticated API route.
- **Workspace Resolution:** A separate `active_workspace_id` HTTP-only cookie tracks which workspace is active. This cookie is read server-side by `getActiveWorkspace()` — callers cannot forge it via query params.
- **Critical Finding:** The workspace resolution is server-side and trusted. Attackers cannot supply an arbitrary `workspace_id` in request bodies to bypass workspace isolation on most endpoints. The cron and conversationId findings exploit a different surface.

### Role/Permission Model
- **Five roles identified:** `anon` (0), `viewer` (1), `editor` (2), `admin` (3), `owner` (4)
- **Storage:** Roles are stored in the `workspace_members` table (`workspace_id`, `user_id`, `role`). No custom JWT claims — roles are DB-only.
- **Enforcement:** `requireWorkspacePermission()` in `lib/workspace-permissions.ts:43-60` is the primary gate. It performs a DB lookup and checks role sufficiency before every significant operation.
- **Critical Finding:** RBAC is consistently applied on mutation endpoints. The gaps are (a) the missing filter on message UPDATE operations after a correctly-guarded SELECT, and (b) the cron endpoint's environment-dependent fallback.

### Resource Access Patterns
- **Workspace isolation:** Most object queries use `.eq('workspace_id', activeWorkspace.id)` to scope DB queries. This correctly prevents cross-workspace reads.
- **Critical Finding:** While reads are consistently workspace-scoped, the message UPDATE at `app/api/messages/route.ts:56-66` breaks this pattern — the mutation uses only `conversation_id` without a `workspace_id` constraint.

### Cron Scheduler Architecture
- **Two invocation paths:** (1) Vercel managed cron (sets `x-vercel-cron` header), (2) `Authorization: Bearer <CRON_SECRET>` for external callers.
- **Critical Finding:** `CRON_SECRET` is absent from `.env.local` and `.env.vercel.example`. The fallback trust of any `x-vercel-cron` header enables unauthenticated external triggering of the scheduler.
- **Downstream impact:** The scheduler invokes `process-scheduled-posts` and `process-scheduled-executions` using the admin Supabase client, which bypasses all RLS policies. Any active automation (including those with HTTP request nodes for SSRF) can be triggered.

### Workflow Implementation
- **Multi-step OAuth (Meta integration):** Correctly implements nonce + workspace-scoped session validation. The `select-page` step verifies workspace membership (`integrations:write`) before consuming the session. Secure.
- **Automation process endpoint:** Initially appeared to have an IDOR, but the `process-automations` Edge Function applies both `workspace_id` AND `automation_id` filters simultaneously, making cross-workspace automation triggering infeasible via this path.

---

## 4. Vectors Analyzed and Confirmed Secure

These authorization checks were traced and confirmed to have robust, properly-placed guards.

| **Endpoint / Component** | **Guard Location** | **Defense Mechanism** | **Verdict** |
|---|---|---|---|
| `GET /api/workspace/settings?workspaceId` | `workspace/settings/route.ts:70` | `requireWorkspacePermission(..., 'workspace:read')` — caller-supplied workspaceId validated against session user's workspace membership | SAFE (horizontal) |
| `GET /api/external-services?workspaceId` | `external-services/route.ts` | `requireWorkspacePermission(..., 'settings:write')` on caller-supplied workspaceId | SAFE |
| `PUT /api/external-services/[id]` | `external-services/[id]/route.ts` | `getServiceInWorkspace(id, workspaceId)` pre-check: both `id` and `workspace_id` required; workspaceId validated via session membership | SAFE |
| `GET /api/chat/sessions/[id]` | `chat/sessions/[id]/route.ts:28-33` | `.eq('workspace_id', activeWorkspace.id)` in DB query; `requireWorkspacePermission` before query | SAFE |
| `GET /api/automations/[id]` | `automations/[id]/route.ts:28-33` | `.eq('workspace_id', activeWorkspace.id)` in DB query; `requireWorkspacePermission` before query | SAFE |
| `POST /api/automations` | `automations/route.ts:129` | `requireWorkspacePermission(..., 'automation:write')` before all DB writes; admin/owner only | SAFE |
| `PUT /api/automations/[id]` | `automations/[id]/route.ts:77` | `requireWorkspacePermission(..., 'automation:write')` before writes; admin/owner only | SAFE |
| `DELETE /api/automations/[id]` | `automations/[id]/route.ts:219` | `requireWorkspacePermission(..., 'automation:write')` before delete; admin/owner only | SAFE |
| `POST /api/automations/[id]/toggle` | `automations/[id]/toggle/route.ts:26` | `requireWorkspacePermission(..., 'automation:write')` before state change | SAFE |
| `POST /api/sync-analytics` | `sync-analytics/route.ts:28` | `requireWorkspacePermission(..., 'analytics:sync')` before Edge Function invocation | SAFE |
| `DELETE /api/brand/social-accounts` | `brand/social-accounts/route.ts:32` | `requireWorkspacePermission(..., 'integrations:write')` before admin-client DELETE | SAFE |
| `GET /api/auth/meta/login` | `auth/meta/login/route.ts:34` | `requireWorkspacePermission(..., 'integrations:write')` before OAuth state cookie | SAFE |
| `POST /api/auth/meta/select-page` | `auth/meta/select-page/route.ts:60` | Session lookup + expiry check + `requireWorkspacePermission` on session's workspaceId | SAFE |
| `GET /api/auth/meta/page-session` | `auth/meta/page-session/route.ts` | Workspace ID from DB record; `requireWorkspacePermission` before data returned; tokens excluded from response | SAFE |
| `POST /api/automations/process` | `automations/process/route.ts` | workspace_id from session cookie; Edge Function applies both workspace_id AND automation_id filters simultaneously | SAFE |
| `createWorkspaceInvite` (Server Action) | `team-members.ts:142` | `requireWorkspaceManageRole` (owner-only); `isInviteRole` blocks `owner` role | SAFE |
| `acceptWorkspaceInvite` (Server Action) | `team-members.ts:419` | Email match `normalizeEmail(invite.email) !== userEmail` enforced before membership insert | SAFE |
| `updateWorkspaceMemberRole` (Server Action) | `team-members.ts:64-87` | `requireWorkspaceManageRole(workspaceId, ["owner"])` — owner only | SAFE |
| `renameWorkspace` (Server Action) | `workspace.ts:85-113` | `getUser()` + membership lookup + `role !== 'owner'` check before UPDATE | SAFE |
| `deleteWorkspace` (Server Action) | `workspace.ts:119-156` | Owner-only application check before admin-client DELETE | SAFE |
| `leaveWorkspace` (Server Action) | `workspace.ts:175` | Owner blocked from leaving: `throw new Error("Owners cannot leave their workspace")` | SAFE |
| `POST /api/messages` (send) | `messages/route.ts:POST` | `requireWorkspacePermission('content:write')` + workspace-scoped conversation lookup before Meta API call | SAFE |
| `GET /api/automations/instagram-media` | `automations/instagram-media/route.ts` | Account lookup scoped by `workspace_id` | SAFE |

---

## 5. Analysis Constraints and Blind Spots

- **Supabase Edge Functions (internal):** Several functions (`process-scheduled-posts`, `process-automations`, `sync-analytics`, `automation-worker-http-request`) run in a Deno runtime and are invoked via service-role key from the Next.js app layer. While the `process-automations` Edge Function was analyzed and found to apply correct dual filters, the SSRF risk in `automation-worker-http-request` (confirmed in recon) remains present once an automation is created by an authorized admin.

- **RLS as Sole Defense:** The `getWorkspaceSettings` Server Action relies entirely on Supabase Row-Level Security. The RLS policy `"Member access settings"` was confirmed in migration files. If a Supabase RLS bypass were discovered, this server action would expose decrypted AI API keys to any authenticated user regardless of workspace membership.

- **Static Analysis Limitation:** The `conversationId` in `GET /api/messages` is a Meta-external ID (not a Supabase UUID). Its format and collision risk could not be verified through static analysis alone — the exploitation phase should confirm whether valid conversationIds from other workspaces can be enumerated or guessed.
