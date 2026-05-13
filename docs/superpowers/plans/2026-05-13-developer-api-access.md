# Developer API Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-grade Developer API foundation so workspace owners can create scoped API keys for Claude, Codex, n8n, and future MCP clients, with a paid-plan entitlement hook that is ready but not enforced yet.

**Architecture:** Build a separate Developer API surface beside the existing session-auth app API. User-session routes manage keys and docs from Settings; external routes authenticate with workspace-scoped bearer keys, check scopes, rate limits, audit every request, and call existing workspace services. The entitlement resolver supports future paid-plan enforcement, but initial rollout runs in preview mode so token creation and token use are not locked until billing is live.

**Tech Stack:** Next.js App Router, Supabase Postgres/RLS, existing workspace RBAC, existing `consume_rate_limit` RPC, TypeScript, Vitest, OpenAPI 3.2, Bearer token auth.

---

## Research Inputs

- OWASP API Security Top 10 2023 names object-level authorization, broken authentication, unrestricted resource consumption, broken function-level authorization, sensitive business flow abuse, misconfiguration, inventory, and unsafe third-party consumption as core API risks: https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- RFC 6750 defines Bearer token use through the `Authorization: Bearer <token>` header and warns that bearer tokens must be protected in storage and transport: https://www.rfc-editor.org/rfc/rfc6750
- OpenAPI 3.2 defines reusable `securitySchemes`, including `apiKey`, HTTP bearer, and OAuth2 schemes: https://spec.openapis.org/oas/latest
- MCP remote authorization now expects OAuth 2.1, protected resource metadata, audience validation, HTTPS, secure token storage, and PKCE for public clients: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- GitHub fine-grained PAT docs recommend minimal repository access and minimal permissions for tokens: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- Stripe API key docs model rotation, expiry, one-time secret display, restricted keys, and central key management: https://docs.stripe.com/keys
- Supabase RLS docs state service keys bypass RLS and must never be exposed to customers: https://supabase.com/docs/guides/database/postgres/row-level-security

## Product Decision

Developer API is designed as a paid-plan feature, but the first implementation must not lock it to paid users yet.

Use this rollout model:

```ts
export type DeveloperApiAccessMode = "off" | "preview" | "paid_only"

// Initial production value:
// DEVELOPER_API_ACCESS_MODE=preview
//
// Billing launch value:
// DEVELOPER_API_ACCESS_MODE=paid_only
```

Behavior:

- `off`: Settings UI shows unavailable state; key management and external API return disabled.
- `preview`: owners/admins can create and use keys; responses include `entitlement.mode = "preview"` so the UI is already wired for paid-plan messaging.
- `paid_only`: token creation and token use require `workspace_entitlements.developer_api_enabled = true`.

This makes the feature ready for paid plans without blocking testing before billing exists.

## Existing Repo Context

- Existing app auth pattern: `createClient()`, `supabase.auth.getUser()`, `getActiveWorkspace()`, `requireWorkspacePermission(...)`.
- Existing permissions live in `lib/workspace-rbac.ts`.
- Existing rate limit primitive lives in `lib/security/rate-limit.ts` and uses `rate_limit_buckets` plus `consume_rate_limit`.
- Existing billing UI says billing, live checkout, usage caps, and entitlement checks are not implemented yet.
- Existing `external_services.api_key` is for third-party credentials and must not be reused for SwiftFlow Developer API tokens.
- `createAdminClient()` uses the Supabase service role. External API keys must never expose or behave like service-role credentials.

## File Map

- Create `lib/developer-api/types.ts` for scopes, entitlement modes, key status, auth context, audit event types.
- Create `lib/developer-api/scopes.ts` for scope definitions, role compatibility, and endpoint scope checks.
- Create `lib/developer-api/key-format.ts` for token generation, prefix parsing, hashing, and constant-time comparison.
- Create `lib/developer-api/entitlements.ts` for the preview/paid/off resolver.
- Create `lib/developer-api/auth.ts` for Bearer token authentication used by `/api/developer/v1/*`.
- Create `lib/developer-api/audit.ts` for request audit logging helpers.
- Create `lib/developer-api/rate-limit.ts` for API-key, workspace, and IP limit wrappers.
- Create `lib/developer-api/openapi.ts` for generated OpenAPI JSON.
- Create `supabase/migrations/20260513000000_add_developer_api_access.sql` for key, entitlement, and audit tables.
- Create `app/api/developer/keys/route.ts` for key list/create from Settings.
- Create `app/api/developer/keys/[id]/route.ts` for rename/revoke/rotate metadata operations.
- Create `app/api/developer/audit-logs/route.ts` for Settings audit history.
- Create `app/api/developer/openapi.json/route.ts` for docs.
- Create `app/api/developer/v1/workspace/route.ts`.
- Create `app/api/developer/v1/brand-profile/route.ts`.
- Create `app/api/developer/v1/posts/drafts/route.ts`.
- Create `app/api/developer/v1/analytics/summary/route.ts`.
- Create `app/api/developer/v1/content-intelligence/analyze-post/route.ts`.
- Create `components/settings/developer-api-view.tsx`.
- Modify `components/settings/settings-view.tsx` to add a Developer API section/tab.
- Modify `app/dashboard/settings/page.tsx` only if the server component needs to pass entitlement state.
- Add focused tests under `lib/developer-api/*.test.ts`.

## Scope Model

Initial scopes:

```ts
export const DEVELOPER_API_SCOPES = [
  "workspace:read",
  "brand:read",
  "brand:write",
  "posts:read",
  "posts:draft:create",
  "analytics:read",
  "content_intelligence:run",
] as const
```

Do not include publish-now, delete, member management, billing, raw integration secrets, Meta token reads, or Supabase admin capabilities in v1.

Role compatibility:

- Owner/admin can create keys.
- Editor/viewer cannot create keys.
- Keys inherit only explicit scopes, not the creator's full role.
- Key use must verify `workspace_id` from the key record on every request.

## API Shape

Management routes use browser session auth:

- `GET /api/developer/keys`
- `POST /api/developer/keys`
- `PATCH /api/developer/keys/:id`
- `DELETE /api/developer/keys/:id`
- `GET /api/developer/audit-logs`
- `GET /api/developer/openapi.json`

External routes use `Authorization: Bearer sf_live_...`:

- `GET /api/developer/v1/workspace`
- `GET /api/developer/v1/brand-profile`
- `PUT /api/developer/v1/brand-profile`
- `GET /api/developer/v1/posts/drafts`
- `POST /api/developer/v1/posts/drafts`
- `GET /api/developer/v1/analytics/summary`
- `POST /api/developer/v1/content-intelligence/analyze-post`

## Task 1: Add Pure Types and Scope Rules

**Files:**
- Create: `lib/developer-api/types.ts`
- Create: `lib/developer-api/scopes.ts`
- Test: `lib/developer-api/scopes.test.ts`

- [ ] **Step 1: Write the failing scope tests**

```ts
import { describe, expect, it } from "vitest"
import { canRoleCreateDeveloperApiKey, normalizeDeveloperApiScopes, requireDeveloperApiScopes } from "./scopes"

describe("developer API scopes", () => {
  it("allows only owners and admins to create keys", () => {
    expect(canRoleCreateDeveloperApiKey("owner")).toBe(true)
    expect(canRoleCreateDeveloperApiKey("admin")).toBe(true)
    expect(canRoleCreateDeveloperApiKey("editor")).toBe(false)
    expect(canRoleCreateDeveloperApiKey("viewer")).toBe(false)
    expect(canRoleCreateDeveloperApiKey(null)).toBe(false)
  })

  it("deduplicates and rejects unknown scopes", () => {
    expect(normalizeDeveloperApiScopes(["brand:read", "brand:read", "analytics:read"])).toEqual([
      "brand:read",
      "analytics:read",
    ])
    expect(() => normalizeDeveloperApiScopes(["billing:write"])).toThrow("Unsupported developer API scope: billing:write")
  })

  it("requires every route scope", () => {
    expect(requireDeveloperApiScopes(["brand:read", "analytics:read"], ["brand:read"])).toEqual({ allowed: true })
    expect(requireDeveloperApiScopes(["brand:read"], ["brand:write"])).toEqual({
      allowed: false,
      missingScopes: ["brand:write"],
    })
  })
})
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm test:ci lib/developer-api/scopes.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement types and scope helpers**

```ts
// lib/developer-api/types.ts
import type { WorkspaceRole } from "@/types/workspace"

export const DEVELOPER_API_SCOPE_VALUES = [
  "workspace:read",
  "brand:read",
  "brand:write",
  "posts:read",
  "posts:draft:create",
  "analytics:read",
  "content_intelligence:run",
] as const

export type DeveloperApiScope = (typeof DEVELOPER_API_SCOPE_VALUES)[number]
export type DeveloperApiKeyStatus = "active" | "revoked" | "expired"
export type DeveloperApiAccessMode = "off" | "preview" | "paid_only"

export interface DeveloperApiEntitlement {
  allowed: boolean
  mode: DeveloperApiAccessMode
  reason: "disabled" | "preview" | "paid_plan_required" | "allowed"
}

export interface DeveloperApiAuthContext {
  workspaceId: string
  apiKeyId: string
  keyPrefix: string
  scopes: DeveloperApiScope[]
  roleSnapshot: WorkspaceRole | null
}
```

```ts
// lib/developer-api/scopes.ts
import type { WorkspaceRole } from "@/types/workspace"
import { DEVELOPER_API_SCOPE_VALUES, type DeveloperApiScope } from "./types"

const SCOPE_SET = new Set<string>(DEVELOPER_API_SCOPE_VALUES)

export function isDeveloperApiScope(value: string): value is DeveloperApiScope {
  return SCOPE_SET.has(value)
}

export function canRoleCreateDeveloperApiKey(role: WorkspaceRole | null | undefined): boolean {
  return role === "owner" || role === "admin"
}

export function normalizeDeveloperApiScopes(values: unknown[]): DeveloperApiScope[] {
  const scopes: DeveloperApiScope[] = []
  for (const value of values) {
    if (typeof value !== "string" || !isDeveloperApiScope(value)) {
      throw new Error(`Unsupported developer API scope: ${String(value)}`)
    }
    if (!scopes.includes(value)) scopes.push(value)
  }
  if (scopes.length === 0) {
    throw new Error("At least one developer API scope is required")
  }
  return scopes
}

export function requireDeveloperApiScopes(
  granted: readonly DeveloperApiScope[],
  required: readonly DeveloperApiScope[],
): { allowed: true } | { allowed: false; missingScopes: DeveloperApiScope[] } {
  const missingScopes = required.filter((scope) => !granted.includes(scope))
  return missingScopes.length === 0 ? { allowed: true } : { allowed: false, missingScopes }
}
```

- [ ] **Step 4: Run the scope test**

Run: `pnpm test:ci lib/developer-api/scopes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/developer-api/types.ts lib/developer-api/scopes.ts lib/developer-api/scopes.test.ts
git commit -m "feat: add developer API scope model"
```

## Task 2: Add Key Format, Hashing, and One-Time Secret Behavior

**Files:**
- Create: `lib/developer-api/key-format.ts`
- Test: `lib/developer-api/key-format.test.ts`

- [ ] **Step 1: Write the failing key tests**

```ts
import { describe, expect, it } from "vitest"
import { createDeveloperApiToken, hashDeveloperApiToken, parseDeveloperApiTokenPrefix } from "./key-format"

describe("developer API key format", () => {
  it("creates a live token with a stable prefix and secret", async () => {
    const token = createDeveloperApiToken()
    expect(token.plaintext).toMatch(/^sf_live_[A-Za-z0-9_-]{10,}_[A-Za-z0-9_-]{32,}$/)
    expect(token.prefix).toMatch(/^sf_live_[A-Za-z0-9_-]{10,}$/)
    expect(parseDeveloperApiTokenPrefix(token.plaintext)).toBe(token.prefix)
  })

  it("hashes with a pepper and never returns plaintext as hash", async () => {
    const token = createDeveloperApiToken()
    const hash = await hashDeveloperApiToken(token.plaintext, "pepper-a")
    expect(hash).not.toContain(token.plaintext)
    expect(hash).toBe(await hashDeveloperApiToken(token.plaintext, "pepper-a"))
    expect(hash).not.toBe(await hashDeveloperApiToken(token.plaintext, "pepper-b"))
  })
})
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm test:ci lib/developer-api/key-format.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement token creation and hashing**

```ts
import { createHmac, randomBytes, timingSafeEqual } from "crypto"

export interface DeveloperApiToken {
  plaintext: string
  prefix: string
}

function base64Url(bytes: Buffer): string {
  return bytes.toString("base64url")
}

export function createDeveloperApiToken(): DeveloperApiToken {
  const publicId = base64Url(randomBytes(12))
  const secret = base64Url(randomBytes(32))
  const prefix = `sf_live_${publicId}`
  return {
    plaintext: `${prefix}_${secret}`,
    prefix,
  }
}

export function parseDeveloperApiTokenPrefix(token: string): string | null {
  const match = token.match(/^(sf_live_[A-Za-z0-9_-]{10,})_[A-Za-z0-9_-]{32,}$/)
  return match?.[1] ?? null
}

export async function hashDeveloperApiToken(token: string, pepper: string): Promise<string> {
  if (!pepper.trim()) throw new Error("DEVELOPER_API_KEY_PEPPER is required")
  return createHmac("sha256", pepper).update(token, "utf8").digest("hex")
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.byteLength !== right.byteLength) return false
  return timingSafeEqual(left, right)
}
```

- [ ] **Step 4: Run the key test**

Run: `pnpm test:ci lib/developer-api/key-format.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/developer-api/key-format.ts lib/developer-api/key-format.test.ts
git commit -m "feat: add developer API key format"
```

## Task 3: Add Database Tables

**Files:**
- Create: `supabase/migrations/20260513000000_add_developer_api_access.sql`

- [ ] **Step 1: Create the migration**

```sql
create table if not exists public.workspace_entitlements (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  developer_api_enabled boolean not null default true,
  entitlement_source text not null default 'preview',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_entitlements_source_check check (entitlement_source in ('preview', 'manual', 'subscription'))
);

create table if not exists public.workspace_api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  key_prefix text not null unique,
  key_hash text not null,
  key_hash_version integer not null default 1,
  scopes text[] not null,
  status text not null default 'active',
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_role_snapshot text,
  expires_at timestamptz,
  last_used_at timestamptz,
  last_used_ip_hash text,
  last_used_user_agent_hash text,
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id) on delete set null,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_api_keys_status_check check (status in ('active', 'revoked', 'expired')),
  constraint workspace_api_keys_name_length check (char_length(name) between 1 and 120),
  constraint workspace_api_keys_scopes_nonempty check (array_length(scopes, 1) >= 1)
);

create index if not exists workspace_api_keys_workspace_id_idx on public.workspace_api_keys(workspace_id);
create index if not exists workspace_api_keys_key_prefix_idx on public.workspace_api_keys(key_prefix);

create table if not exists public.workspace_api_key_audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  api_key_id uuid references public.workspace_api_keys(id) on delete set null,
  key_prefix text,
  actor_type text not null default 'api_key',
  actor_user_id uuid references auth.users(id) on delete set null,
  request_id text not null,
  method text not null,
  route text not null,
  action text not null,
  scopes_required text[] not null default '{}',
  status_code integer not null,
  ip_hash text,
  user_agent_hash text,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint workspace_api_key_audit_actor_check check (actor_type in ('user', 'api_key', 'system')),
  constraint workspace_api_key_audit_status_code_check check (status_code between 100 and 599)
);

create index if not exists workspace_api_key_audit_logs_workspace_created_idx
  on public.workspace_api_key_audit_logs(workspace_id, created_at desc);

alter table public.workspace_entitlements enable row level security;
alter table public.workspace_api_keys enable row level security;
alter table public.workspace_api_key_audit_logs enable row level security;

create policy "Members can read workspace entitlement"
  on public.workspace_entitlements
  for select
  to authenticated
  using (public.is_member_of(workspace_id));

create policy "Admins can read API key metadata"
  on public.workspace_api_keys
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_api_keys.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "Admins can read API audit logs"
  on public.workspace_api_key_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_api_key_audit_logs.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

grant select on public.workspace_entitlements to authenticated;
grant select on public.workspace_api_keys to authenticated;
grant select on public.workspace_api_key_audit_logs to authenticated;
grant all on public.workspace_entitlements to service_role;
grant all on public.workspace_api_keys to service_role;
grant all on public.workspace_api_key_audit_logs to service_role;
```

- [ ] **Step 2: Verify migration syntax locally**

Run: `pnpm validate:env`

Expected: PASS for local environment validation. Apply the migration through the normal Supabase workflow used by this repo before deployment.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260513000000_add_developer_api_access.sql
git commit -m "feat: add developer API tables"
```

## Task 4: Add Preview/Paid Entitlement Resolver

**Files:**
- Create: `lib/developer-api/entitlements.ts`
- Test: `lib/developer-api/entitlements.test.ts`

- [ ] **Step 1: Write entitlement tests**

```ts
import { describe, expect, it } from "vitest"
import { resolveDeveloperApiEntitlementFromInputs } from "./entitlements"

describe("developer API entitlements", () => {
  it("allows preview mode without requiring paid entitlement", () => {
    expect(resolveDeveloperApiEntitlementFromInputs("preview", false)).toEqual({
      allowed: true,
      mode: "preview",
      reason: "preview",
    })
  })

  it("requires entitlement in paid-only mode", () => {
    expect(resolveDeveloperApiEntitlementFromInputs("paid_only", false)).toEqual({
      allowed: false,
      mode: "paid_only",
      reason: "paid_plan_required",
    })
    expect(resolveDeveloperApiEntitlementFromInputs("paid_only", true)).toEqual({
      allowed: true,
      mode: "paid_only",
      reason: "allowed",
    })
  })

  it("blocks disabled mode", () => {
    expect(resolveDeveloperApiEntitlementFromInputs("off", true)).toEqual({
      allowed: false,
      mode: "off",
      reason: "disabled",
    })
  })
})
```

- [ ] **Step 2: Implement resolver**

```ts
import { createAdminClient } from "@/utils/supabase/admin"
import type { DeveloperApiAccessMode, DeveloperApiEntitlement } from "./types"

export function getDeveloperApiAccessMode(): DeveloperApiAccessMode {
  const raw = process.env.DEVELOPER_API_ACCESS_MODE
  if (raw === "off" || raw === "paid_only" || raw === "preview") return raw
  return "preview"
}

export function resolveDeveloperApiEntitlementFromInputs(
  mode: DeveloperApiAccessMode,
  enabled: boolean,
): DeveloperApiEntitlement {
  if (mode === "off") return { allowed: false, mode, reason: "disabled" }
  if (mode === "preview") return { allowed: true, mode, reason: "preview" }
  return enabled
    ? { allowed: true, mode, reason: "allowed" }
    : { allowed: false, mode, reason: "paid_plan_required" }
}

export async function getDeveloperApiEntitlement(workspaceId: string): Promise<DeveloperApiEntitlement> {
  const mode = getDeveloperApiAccessMode()
  if (mode === "off" || mode === "preview") {
    return resolveDeveloperApiEntitlementFromInputs(mode, false)
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("workspace_entitlements")
    .select("developer_api_enabled")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (error) {
    console.error("[developer-api] failed to load entitlement", error)
    return { allowed: false, mode, reason: "paid_plan_required" }
  }

  return resolveDeveloperApiEntitlementFromInputs(mode, Boolean(data?.developer_api_enabled))
}
```

- [ ] **Step 3: Run entitlement test**

Run: `pnpm test:ci lib/developer-api/entitlements.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/developer-api/entitlements.ts lib/developer-api/entitlements.test.ts
git commit -m "feat: add developer API entitlement resolver"
```

## Task 5: Add Management Routes for Keys

**Files:**
- Create: `app/api/developer/keys/route.ts`
- Create: `app/api/developer/keys/[id]/route.ts`

- [ ] **Step 1: Implement `GET` and `POST /api/developer/keys`**

Key requirements:

- Use `createClient()`.
- Require logged-in user.
- Use `getActiveWorkspace()`.
- Require `settings:write`.
- Require `canRoleCreateDeveloperApiKey(role)`.
- Check `getDeveloperApiEntitlement(activeWorkspace.id)`.
- In `preview`, allow create.
- In `paid_only`, block create when `allowed` is false.
- Generate plaintext once with `createDeveloperApiToken()`.
- Store `key_hash`, `key_prefix`, `scopes`, `created_by_user_id`, `created_by_role_snapshot`.
- Return plaintext only in the create response.
- Never return `key_hash`.

- [ ] **Step 2: Implement `PATCH` and `DELETE /api/developer/keys/:id`**

Key requirements:

- `PATCH` supports name changes and expiry changes only.
- `DELETE` marks `status = "revoked"`, sets `revoked_at`, `revoked_by_user_id`, and `revoked_reason`.
- No hard delete for auditability.

- [ ] **Step 3: Manual route verification**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/developer/keys/route.ts app/api/developer/keys/[id]/route.ts
git commit -m "feat: add developer API key management routes"
```

## Task 6: Add External API Auth, Audit, and Rate Limits

**Files:**
- Create: `lib/developer-api/auth.ts`
- Create: `lib/developer-api/audit.ts`
- Create: `lib/developer-api/rate-limit.ts`

- [ ] **Step 1: Implement Bearer auth**

Requirements:

- Read `Authorization` header.
- Require `Bearer` scheme.
- Reject query-string tokens.
- Parse prefix with `parseDeveloperApiTokenPrefix`.
- Fetch key row by `key_prefix` using admin client.
- Reject missing, revoked, expired, or out-of-entitlement keys.
- Hash provided token with `DEVELOPER_API_KEY_PEPPER`.
- Compare stored hash with constant-time compare.
- Update last-used metadata only after successful authentication.

- [ ] **Step 2: Implement audit helper**

Requirements:

- Log successful and failed external API requests.
- Hash IP and user agent before storing.
- Store route, method, action, status, scopes required, request id, key prefix when available.
- Do not store request bodies or tokens.

- [ ] **Step 3: Implement rate limit wrapper**

Limits:

- Key read routes: 120 requests per minute per key.
- Key write routes: 30 requests per minute per key.
- Workspace content-intelligence route: 10 requests per minute per workspace.
- IP failed-auth route: 20 failures per 10 minutes per IP.

For developer API routes, rate-limit infrastructure failure must fail closed for write and content-intelligence routes, and fail open only for read routes with an audit warning.

- [ ] **Step 4: Commit**

```bash
git add lib/developer-api/auth.ts lib/developer-api/audit.ts lib/developer-api/rate-limit.ts
git commit -m "feat: add developer API auth controls"
```

## Task 7: Add Safe v1 REST Endpoints

**Files:**
- Create: `app/api/developer/v1/workspace/route.ts`
- Create: `app/api/developer/v1/brand-profile/route.ts`
- Create: `app/api/developer/v1/posts/drafts/route.ts`
- Create: `app/api/developer/v1/analytics/summary/route.ts`
- Create: `app/api/developer/v1/content-intelligence/analyze-post/route.ts`

- [ ] **Step 1: Add `GET /workspace`**

Required scope: `workspace:read`.

Response:

```json
{
  "workspace": {
    "id": "uuid",
    "name": "Workspace name"
  },
  "api": {
    "version": "v1"
  }
}
```

- [ ] **Step 2: Add `GET` and `PUT /brand-profile`**

Required scopes:

- `GET`: `brand:read`
- `PUT`: `brand:write`

Use the same safe fields as the existing brand profile route. Do not expose integration tokens or provider API keys.

- [ ] **Step 3: Add draft post endpoints**

Required scopes:

- `GET`: `posts:read`
- `POST`: `posts:draft:create`

`POST` creates draft content only. It must not publish to Meta or schedule external publishing in v1.

- [ ] **Step 4: Add analytics summary**

Required scope: `analytics:read`.

Return small aggregate data only. No raw access tokens, provider account secrets, or internal sync logs.

- [ ] **Step 5: Add content intelligence analyze endpoint**

Required scope: `content_intelligence:run`.

Route should call existing content intelligence helpers and rate limit as a cost-sensitive route.

- [ ] **Step 6: Verify routes compile**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/developer/v1
git commit -m "feat: add developer API v1 endpoints"
```

## Task 8: Add Settings UI

**Files:**
- Create: `components/settings/developer-api-view.tsx`
- Modify: `components/settings/settings-view.tsx`
- Modify: `app/dashboard/settings/page.tsx` if server-side entitlement props are needed.

- [ ] **Step 1: Add Developer API view**

UI requirements:

- Compact Settings section consistent with current dark UI.
- Shows preview badge when `entitlement.mode = "preview"`.
- Shows paid-plan-ready state but does not block in preview.
- Scope checklist with clear labels.
- Expiration select: 30 days, 90 days, 180 days, 1 year.
- Secret display modal after creation only.
- Copy button for the new secret.
- Revoke action with confirmation.
- Audit log table.

- [ ] **Step 2: Add Settings integration**

Add Developer API section below provider API settings or as a tab in the same Settings page.

- [ ] **Step 3: Verify UI compiles**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/settings/developer-api-view.tsx components/settings/settings-view.tsx app/dashboard/settings/page.tsx
git commit -m "feat: add developer API settings UI"
```

## Task 9: Add OpenAPI Document

**Files:**
- Create: `lib/developer-api/openapi.ts`
- Create: `app/api/developer/openapi.json/route.ts`

- [ ] **Step 1: Generate an OpenAPI 3.2 document**

Requirements:

- Include `securitySchemes.DeveloperApiBearer`.
- Use HTTP bearer auth in docs because clients send `Authorization: Bearer`.
- Document required scopes in operation descriptions and `x-required-scopes`.
- Document 401, 403, 429, and 500 responses.
- Exclude internal management routes that require browser sessions.

- [ ] **Step 2: Verify JSON route**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/developer-api/openapi.ts app/api/developer/openapi.json/route.ts
git commit -m "feat: add developer API OpenAPI document"
```

## Task 10: Add MCP Bridge Design Checkpoint

**Files:**
- Create: `docs/developer-api/mcp-bridge-design.md`

- [ ] **Step 1: Write MCP bridge design**

Design constraints:

- Remote MCP must use OAuth 2.1-style authorization, protected resource metadata, HTTPS, audience validation, and PKCE-compatible flows.
- Local/dev MCP clients can use Developer API bearer keys during preview.
- MCP tools must map to the same v1 safe REST operations.
- No tool can expose billing, raw Meta tokens, Supabase service-role keys, member management, or publish-now actions.

- [ ] **Step 2: Commit**

```bash
git add docs/developer-api/mcp-bridge-design.md
git commit -m "docs: add developer API MCP bridge design"
```

## Task 11: Final Verification and Push

**Files:**
- All files touched by prior tasks.

- [ ] **Step 1: Run focused tests**

Run: `pnpm test:ci lib/developer-api`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 4: Push to main target**

```bash
git push origin HEAD:master
```

Expected: `master` receives the completed Developer API foundation.

## Non-Negotiables

- Never store plaintext API keys after creation.
- Never log tokens or request bodies.
- Never expose Supabase service-role keys or Meta access tokens.
- Never let an API key cross workspace boundaries.
- Never ship publish-now, billing mutation, team/member mutation, or destructive deletion in v1.
- Every endpoint must check scopes and workspace ownership from the key record.
- Every external request must produce an audit log attempt, including failed auth where possible.
- Entitlement must be wired from day one, but initial mode remains `preview` until billing is live.
