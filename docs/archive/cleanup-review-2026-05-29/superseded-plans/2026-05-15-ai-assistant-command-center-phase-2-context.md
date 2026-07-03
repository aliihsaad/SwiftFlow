# AI Assistant Command Center Phase 2 Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI Assistant context-aware by adding a server-side command route and read-only context packs for brand, posts, analytics, automations, and connected accounts.

**Architecture:** Phase 2 keeps the Phase 1 visible mode shell and preserves existing generation flows. It adds server-side context assembly, a higher-level `/api/assistant/command` route for chat-assistant mode/action requests, and lightweight UI context receipts so users can see what data informed the answer. Write actions, confirmation cards, and autonomous mutations stay out of scope until Phase 3.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase admin/server clients, existing Supabase Edge Functions, Vitest.

---

## Scope

Phase 2 implements read-only assistant context:

1. Add typed assistant context packs.
2. Build deterministic context selection from the Phase 1 intent router output.
3. Add server-side workspace/auth helpers shared by `/api/assistant/invoke` and `/api/assistant/command`.
4. Add a reusable assistant Edge Function invoke helper.
5. Add context builders for:
   - brand profile
   - recent posts/drafts/scheduled posts
   - analytics with read-through sync
   - active/recent automations
   - connected account status
6. Add `POST /api/assistant/command` for context-aware chat-assistant calls.
7. Pass compact context into the existing `chat-assistant` Supabase Edge Function.
8. Wire the client to use `/api/assistant/command` only for `chat-assistant` intents.
9. Show a small “Used context” receipt under context-aware assistant replies.

Phase 2 does not create, update, schedule, publish, delete, activate, or disable anything. Those require explicit confirmation cards in Phase 3.

## File Structure

Create:

1. `lib/assistant/context-types.ts`
   - Shared request/response and context-pack types.

2. `lib/assistant/context-selection.ts`
   - Pure helpers that decide which context packs are needed for each intent.

3. `lib/assistant/auth.ts`
   - Authenticated workspace resolver for assistant API routes.

4. `lib/assistant/edge-invoke.ts`
   - Shared Supabase Edge Function invocation helper used by assistant routes.

5. `lib/assistant/context-packs.ts`
   - Server-only context assembly from Supabase.

6. `app/api/assistant/command/route.ts`
   - Context-aware assistant command route.

7. `app/dashboard/assistant/components/command-center/context-receipt.tsx`
   - Compact context receipt shown under assistant replies.

8. `tests/developer-api/assistant-context-selection.test.ts`
   - Pure context selection tests.

9. `tests/developer-api/assistant-context-packs.test.ts`
   - Context builder tests with a small fake Supabase client.

10. `tests/developer-api/assistant-command-route.test.ts`
    - Command route tests with mocked auth, context builder, and Edge invocation.

Modify:

1. `app/api/assistant/invoke/route.ts`
   - Reuse new auth and Edge invocation helpers without changing external behavior.

2. `app/dashboard/assistant/assistant-types.ts`
   - Import or re-export command/context response metadata used by UI messages.

3. `app/dashboard/assistant/chat-interface.tsx`
   - Use `/api/assistant/command` for `chat-assistant` intents and attach context receipt metadata.

4. `supabase/functions/chat-assistant/index.ts`
   - Accept optional `assistantContext` and include a compact source-grounding block in the system instruction.

5. `vercel.json`
   - Add or verify function maxDuration for `app/api/assistant/command/route.ts` if needed.

## Context Pack Rules

Use these rules in Phase 2:

| Mode/action | Packs |
| --- | --- |
| `generate_caption`, `improve_text`, `general_chat` in create/improve/ask | brand, account, content summary |
| `analyze_workspace` | brand, account, analytics, content summary |
| `inspect_posts` | brand, account, content |
| `inspect_automations` | brand, account, automations |
| image/carousel/ideas specialized flows | keep existing `/api/assistant/invoke` path |

Context budgets:

1. Send no more than 12 posts.
2. Send no more than 8 automation summaries.
3. Send no more than 10 top analytics rows.
4. Never send access tokens, refresh tokens, API keys, full metadata blobs, or user emails.
5. Analytics context must call `maybeSyncWorkspaceAnalytics` when stale, then return cached data even if sync fails.

---

## Task 1: Add Context Types and Pure Selection

**Files:**
- Create: `lib/assistant/context-types.ts`
- Create: `lib/assistant/context-selection.ts`
- Create: `tests/developer-api/assistant-context-selection.test.ts`
- Modify: `app/dashboard/assistant/assistant-types.ts`

- [ ] **Step 1: Create context types**

Create `lib/assistant/context-types.ts`:

```ts
import type {
  AssistantAction,
  AssistantConfidence,
  AssistantFunctionName,
  AssistantMessage,
  AssistantMode,
} from "@/app/dashboard/assistant/assistant-types"
import type { AnalyticsReadThroughSyncResult } from "@/lib/analytics/read-through-sync"

export type AssistantContextKind = "brand" | "content" | "analytics" | "automations" | "accounts"

export interface AssistantSelectedContext {
  postId?: string
  draftId?: string
  analyticsRange?: "7d" | "30d" | "90d"
  automationId?: string
}

export interface AssistantCommandRequest {
  message: string
  messages: AssistantMessage[]
  mode: AssistantMode
  action: AssistantAction
  functionName: AssistantFunctionName
  confidence: AssistantConfidence
  needsClarification: boolean
  workspaceId?: string
  selectedContext?: AssistantSelectedContext
}

export interface AssistantBrandContext {
  businessName: string
  industry: string
  brandVoice: string
  language: string
  targetAudience: string
  businessDescription: string
  services: string[]
  uniqueSellingPoints: string[]
  contentThemes: string[]
  brandColors?: {
    enabled?: boolean
    primary?: string
    secondary?: string
    accent?: string
  }
}

export interface AssistantPostContextItem {
  id: string
  status: string
  content: string
  platforms: string[]
  mediaCount: number
  scheduledFor: string | null
  publishedAt: string | null
  updatedAt: string | null
}

export interface AssistantAnalyticsContext {
  range: "7d" | "30d" | "90d"
  totals: {
    views: number
    likes: number
    comments: number
    shares: number
    saves: number
    publishedPosts: number
    connectedAccounts: number
  }
  topPosts: Array<{
    publishedPostId: string
    platform: string
    publishedAt: string | null
    views: number
    likes: number
    comments: number
    shares: number
    saves: number
    score: number
  }>
  sync: AnalyticsReadThroughSyncResult
}

export interface AssistantAutomationContextItem {
  id: string
  name: string
  type: string
  isActive: boolean
  totalTriggered: number
  totalDmsSent: number
  updatedAt: string | null
}

export interface AssistantAccountContextItem {
  id: string
  platform: "instagram" | "facebook"
  accountName: string
  accountId: string
  connected: boolean
  capabilities: {
    analyticsRead?: boolean
    comments?: boolean
    messages?: boolean
    publishing?: boolean
  }
}

export interface AssistantContextPack {
  requestedKinds: AssistantContextKind[]
  brand?: AssistantBrandContext
  content?: {
    recentPosts: AssistantPostContextItem[]
    selectedPost?: AssistantPostContextItem
  }
  analytics?: AssistantAnalyticsContext
  automations?: {
    activeCount: number
    items: AssistantAutomationContextItem[]
  }
  accounts?: {
    connectedCount: number
    items: AssistantAccountContextItem[]
  }
  generatedAt: string
  warnings: string[]
}

export interface AssistantContextReceipt {
  label: string
  packs: AssistantContextKind[]
  warnings: string[]
  analyticsSyncReason?: string
}

export interface AssistantCommandResponse {
  data: unknown
  assistantIntent: {
    mode: AssistantMode
    action: AssistantAction
    confidence: AssistantConfidence
  }
  assistantContext: AssistantContextPack
  contextReceipt: AssistantContextReceipt
}
```

- [ ] **Step 2: Create pure context selection helpers**

Create `lib/assistant/context-selection.ts`:

```ts
import type { AssistantAction, AssistantMode } from "@/app/dashboard/assistant/assistant-types"
import type { AssistantContextKind, AssistantContextPack, AssistantContextReceipt } from "./context-types"

export function contextKindsForIntent(mode: AssistantMode, action: AssistantAction): AssistantContextKind[] {
  if (action === "analyze_workspace") return ["brand", "accounts", "analytics", "content"]
  if (action === "inspect_posts") return ["brand", "accounts", "content"]
  if (action === "inspect_automations") return ["brand", "accounts", "automations"]
  if (action === "improve_text") return ["brand", "accounts", "content"]
  if (mode === "operate") return ["brand", "accounts", "content", "automations"]
  if (mode === "ask") return ["brand", "accounts", "content"]
  return ["brand", "accounts", "content"]
}

export function summarizeAssistantContext(context: AssistantContextPack): AssistantContextReceipt {
  const pieces: string[] = []
  if (context.brand?.businessName) pieces.push(context.brand.businessName)
  if (context.content?.recentPosts?.length) pieces.push(`${context.content.recentPosts.length} recent posts`)
  if (context.analytics) pieces.push(`${context.analytics.range} analytics`)
  if (context.automations) pieces.push(`${context.automations.activeCount} active automations`)
  if (context.accounts) pieces.push(`${context.accounts.connectedCount} connected accounts`)

  return {
    label: pieces.length ? `Used ${pieces.join(", ")}` : "Used workspace context",
    packs: context.requestedKinds,
    warnings: context.warnings,
    analyticsSyncReason: context.analytics?.sync.reason,
  }
}
```

- [ ] **Step 3: Add selection tests**

Create `tests/developer-api/assistant-context-selection.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { contextKindsForIntent, summarizeAssistantContext } from "@/lib/assistant/context-selection"
import type { AssistantContextPack } from "@/lib/assistant/context-types"

describe("assistant context selection", () => {
  it("uses analytics context for analyze mode", () => {
    expect(contextKindsForIntent("analyze", "analyze_workspace")).toEqual(["brand", "accounts", "analytics", "content"])
  })

  it("uses automation context for automation inspection", () => {
    expect(contextKindsForIntent("operate", "inspect_automations")).toEqual(["brand", "accounts", "automations"])
  })

  it("uses post context for post inspection", () => {
    expect(contextKindsForIntent("operate", "inspect_posts")).toEqual(["brand", "accounts", "content"])
  })

  it("summarizes context receipts compactly", () => {
    const context: AssistantContextPack = {
      requestedKinds: ["brand", "accounts", "content"],
      brand: {
        businessName: "Aldievlab",
        industry: "AI SaaS",
        brandVoice: "professional",
        language: "en",
        targetAudience: "technical founders",
        businessDescription: "AI-first development studio",
        services: [],
        uniqueSellingPoints: [],
        contentThemes: [],
      },
      accounts: { connectedCount: 2, items: [] },
      content: { recentPosts: [{ id: "p1", status: "draft", content: "Test", platforms: ["instagram"], mediaCount: 0, scheduledFor: null, publishedAt: null, updatedAt: null }] },
      generatedAt: "2026-05-15T00:00:00.000Z",
      warnings: [],
    }

    expect(summarizeAssistantContext(context)).toMatchObject({
      label: "Used Aldievlab, 1 recent posts, 2 connected accounts",
      packs: ["brand", "accounts", "content"],
      warnings: [],
    })
  })
})
```

- [ ] **Step 4: Re-export context metadata for UI messages**

Modify `app/dashboard/assistant/assistant-types.ts`:

```ts
import type { AssistantContextReceipt } from '@/lib/assistant/context-types'
```

Then extend `AssistantMessage`:

```ts
export interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
  type?: AssistantMessageType
  data?: any
  images?: MessageImage[]
  contextReceipt?: AssistantContextReceipt
}
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm test:ci tests/developer-api/assistant-context-selection.test.ts
```

Expected:

```text
PASS tests/developer-api/assistant-context-selection.test.ts
```

Commit:

```bash
git add lib/assistant/context-types.ts lib/assistant/context-selection.ts tests/developer-api/assistant-context-selection.test.ts app/dashboard/assistant/assistant-types.ts
git commit -m "Add assistant context selection types"
```

## Task 2: Extract Assistant Auth and Edge Invoke Helpers

**Files:**
- Create: `lib/assistant/auth.ts`
- Create: `lib/assistant/edge-invoke.ts`
- Modify: `app/api/assistant/invoke/route.ts`
- Test: existing assistant invoke behavior through build and later command route tests

- [ ] **Step 1: Create authenticated workspace resolver**

Create `lib/assistant/auth.ts`:

```ts
import type { NextRequest } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"

export class AssistantAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = "AssistantAuthError"
  }
}

export interface AssistantWorkspaceContext {
  userId: string
  workspaceId: string
}

export async function resolveAssistantWorkspace(request: NextRequest, requestedWorkspaceId?: unknown): Promise<AssistantWorkspaceContext> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new AssistantAuthError("Unauthorized", 401)
  }

  const cookieWorkspaceId = request.cookies.get("active_workspace_id")?.value || null
  const bodyWorkspaceId = typeof requestedWorkspaceId === "string" ? requestedWorkspaceId : null
  const admin = createAdminClient()
  const { data: memberships, error } = await admin
    .from("workspace_members")
    .select("workspace_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })

  if (error) throw new AssistantAuthError(`Failed to resolve workspace membership: ${error.message}`, 500)
  if (!memberships || memberships.length === 0) throw new AssistantAuthError("No workspace memberships found for this account", 403)

  const allowedWorkspaceIds = new Set(memberships.map((membership: { workspace_id: string }) => membership.workspace_id))
  const workspaceId = [bodyWorkspaceId, cookieWorkspaceId].find((id): id is string => !!id && allowedWorkspaceIds.has(id)) || memberships[0].workspace_id

  return { userId: user.id, workspaceId }
}
```

- [ ] **Step 2: Create Edge invocation helper**

Create `lib/assistant/edge-invoke.ts`:

```ts
export type AssistantEdgeFunctionName =
  | "chat-assistant"
  | "generate-image"
  | "generate-ideas"
  | "generate-carousel"
  | "generate-reply"
  | "generate-message-reply"

const ALLOWED_FUNCTIONS = new Set<AssistantEdgeFunctionName>([
  "chat-assistant",
  "generate-image",
  "generate-ideas",
  "generate-carousel",
  "generate-reply",
  "generate-message-reply",
])

export function assertAssistantEdgeFunctionName(value: unknown): AssistantEdgeFunctionName {
  if (typeof value !== "string" || !ALLOWED_FUNCTIONS.has(value as AssistantEdgeFunctionName)) {
    throw new Error(typeof value === "string" ? `Function "${value}" is not allowed` : "functionName is required")
  }
  return value as AssistantEdgeFunctionName
}

function looksLikeJwt(value: string | null | undefined): boolean {
  const normalized = String(value || "").trim()
  return normalized.startsWith("eyJ") && normalized.split(".").length === 3
}

async function parseEdgeResponse(response: Response): Promise<unknown> {
  const rawText = await response.text()
  if (!rawText) return null
  try {
    return JSON.parse(rawText)
  } catch {
    return { error: rawText }
  }
}

export async function invokeAssistantEdgeFunction(functionName: AssistantEdgeFunctionName, body: Record<string, unknown>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 500, payload: { error: "Server config missing Supabase URL or service key" } }
  }

  const authJwt = looksLikeJwt(serviceKey) ? serviceKey : (looksLikeJwt(anonKey) ? anonKey : null)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: serviceKey,
  }
  if (authJwt) headers.Authorization = `Bearer ${authJwt}`

  const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })

  const payload = await parseEdgeResponse(edgeResponse)
  return {
    ok: edgeResponse.ok,
    status: edgeResponse.status,
    payload,
  }
}
```

- [ ] **Step 3: Refactor `/api/assistant/invoke` to use helpers**

Modify `app/api/assistant/invoke/route.ts`:

1. Remove local `ALLOWED_FUNCTIONS`, `AllowedFunctionName`, and `looksLikeJwt`.
2. Import:

```ts
import { AssistantAuthError, resolveAssistantWorkspace } from "@/lib/assistant/auth"
import { assertAssistantEdgeFunctionName, invokeAssistantEdgeFunction } from "@/lib/assistant/edge-invoke"
```

3. Replace function validation:

```ts
let functionName
try {
  functionName = assertAssistantEdgeFunctionName(payload?.functionName)
} catch (error) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid function" }, { status: 400 })
}
```

4. Replace manual auth/workspace resolution:

```ts
const workspace = await resolveAssistantWorkspace(request, body?.workspaceId)
```

5. Preserve rate limiting with:

```ts
{ scope: `assistant:${functionName}:user`, subject: `${workspace.userId}:${workspace.workspaceId}`, limit: 30, windowSeconds: 15 * 60 }
```

6. Build sanitized body:

```ts
const invokeBody = {
  ...sanitizeAssistantInvokePayload(functionName, body || {}),
  workspaceId: workspace.workspaceId,
}
```

7. Replace manual fetch:

```ts
const edgeResult = await invokeAssistantEdgeFunction(functionName, invokeBody)
if (!edgeResult.ok) {
  const errorPayload = edgeResult.payload && typeof edgeResult.payload === "object" ? edgeResult.payload as { error?: unknown } : {}
  const details = typeof errorPayload.error === "string" ? errorPayload.error : `Edge function ${functionName} failed`
  console.error(`[assistant/invoke] ${functionName} non-2xx:`, edgeResult.status, details)
  return NextResponse.json({ error: details }, { status: edgeResult.status >= 400 ? edgeResult.status : 502 })
}
return NextResponse.json({ data: edgeResult.payload }, { status: 200 })
```

8. Add catch handling:

```ts
if (error instanceof AssistantAuthError) {
  return NextResponse.json({ error: error.message }, { status: error.status })
}
```

- [ ] **Step 4: Run build to protect external behavior**

Run:

```bash
pnpm build
```

Expected:

```text
Compiled successfully
```

- [ ] **Step 5: Commit helper extraction**

Commit:

```bash
git add lib/assistant/auth.ts lib/assistant/edge-invoke.ts app/api/assistant/invoke/route.ts
git commit -m "Extract assistant route helpers"
```

## Task 3: Build Server-Side Context Packs

**Files:**
- Create: `lib/assistant/context-packs.ts`
- Create: `tests/developer-api/assistant-context-packs.test.ts`

- [ ] **Step 1: Implement context pack builder**

Create `lib/assistant/context-packs.ts` with server-only helpers:

```ts
import "server-only"
import { createAdminClient } from "@/utils/supabase/admin"
import { maybeSyncWorkspaceAnalytics } from "@/lib/analytics/read-through-sync"
import type { AssistantAction, AssistantMode } from "@/app/dashboard/assistant/assistant-types"
import { contextKindsForIntent } from "./context-selection"
import type {
  AssistantAccountContextItem,
  AssistantAnalyticsContext,
  AssistantAutomationContextItem,
  AssistantBrandContext,
  AssistantContextPack,
  AssistantPostContextItem,
  AssistantSelectedContext,
} from "./context-types"

type SupabaseAdmin = ReturnType<typeof createAdminClient>

function text(value: unknown, fallback = "", max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback
}

function stringList(value: unknown, maxItems = 10): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item, "", 140)).filter(Boolean).slice(0, maxItems)
    : []
}

function numberValue(value: unknown): number {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function platformList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => text(item, "", 40)).filter(Boolean) : []
}

function readCapabilities(metadata: unknown): AssistantAccountContextItem["capabilities"] {
  const record = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {}
  const capabilities = record.capabilities && typeof record.capabilities === "object" ? record.capabilities as Record<string, unknown> : record
  return {
    analyticsRead: capabilities.analytics_read === true,
    comments: capabilities.comments === true || capabilities.comment_reply === true,
    messages: capabilities.messages === true || capabilities.dm_reply === true,
    publishing: capabilities.publishing === true || capabilities.content_publish === true,
  }
}

async function buildBrandContext(admin: SupabaseAdmin, workspaceId: string): Promise<AssistantBrandContext | undefined> {
  const { data, error } = await admin
    .from("workspace_brand_profiles")
    .select("business_name, industry, brand_voice, language, target_audience, business_description, services, unique_selling_points, content_themes, brand_colors")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (error || !data) return undefined

  return {
    businessName: text(data.business_name, "", 160),
    industry: text(data.industry, "", 160),
    brandVoice: text(data.brand_voice, "professional", 80),
    language: text(data.language, "en", 20),
    targetAudience: text(data.target_audience, "", 500),
    businessDescription: text(data.business_description, "", 700),
    services: stringList(data.services, 12),
    uniqueSellingPoints: stringList(data.unique_selling_points, 8),
    contentThemes: stringList(data.content_themes, 15),
    brandColors: data.brand_colors && typeof data.brand_colors === "object" ? data.brand_colors as AssistantBrandContext["brandColors"] : undefined,
  }
}

async function buildAccountContext(admin: SupabaseAdmin, workspaceId: string) {
  const { data, error } = await admin
    .from("social_accounts")
    .select("id, platform, account_name, account_id, metadata")
    .eq("workspace_id", workspaceId)
    .in("platform", ["instagram", "facebook"])
    .order("platform", { ascending: true })

  if (error) return { connectedCount: 0, items: [] as AssistantAccountContextItem[] }

  const items = (data || []).map((account: Record<string, unknown>) => ({
    id: text(account.id, "", 80),
    platform: account.platform === "facebook" ? "facebook" as const : "instagram" as const,
    accountName: text(account.account_name, "", 160),
    accountId: text(account.account_id, "", 120),
    connected: true,
    capabilities: readCapabilities(account.metadata),
  }))

  return { connectedCount: items.length, items }
}

async function buildContentContext(admin: SupabaseAdmin, workspaceId: string, selectedContext?: AssistantSelectedContext) {
  const { data } = await admin
    .from("posts")
    .select("id, content, media_urls, platforms, status, scheduled_for, published_at, updated_at, created_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(12)

  const recentPosts: AssistantPostContextItem[] = (data || []).map((post: Record<string, unknown>) => ({
    id: text(post.id, "", 80),
    status: text(post.status, "draft", 40),
    content: text(post.content, "", 700),
    platforms: platformList(post.platforms),
    mediaCount: Array.isArray(post.media_urls) ? post.media_urls.length : 0,
    scheduledFor: typeof post.scheduled_for === "string" ? post.scheduled_for : null,
    publishedAt: typeof post.published_at === "string" ? post.published_at : null,
    updatedAt: typeof post.updated_at === "string" ? post.updated_at : typeof post.created_at === "string" ? post.created_at : null,
  }))

  const selectedId = selectedContext?.postId || selectedContext?.draftId
  const selectedPost = selectedId ? recentPosts.find((post) => post.id === selectedId) : undefined
  return { recentPosts, selectedPost }
}

async function buildAutomationContext(admin: SupabaseAdmin, workspaceId: string) {
  const { data } = await admin
    .from("automations")
    .select("id, name, type, is_active, total_triggered, total_dms_sent, updated_at, created_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(8)

  const items: AssistantAutomationContextItem[] = (data || []).map((automation: Record<string, unknown>) => ({
    id: text(automation.id, "", 80),
    name: text(automation.name, "Untitled automation", 160),
    type: text(automation.type, "", 80),
    isActive: automation.is_active === true,
    totalTriggered: numberValue(automation.total_triggered),
    totalDmsSent: numberValue(automation.total_dms_sent),
    updatedAt: typeof automation.updated_at === "string" ? automation.updated_at : typeof automation.created_at === "string" ? automation.created_at : null,
  }))

  return { activeCount: items.filter((item) => item.isActive).length, items }
}

async function buildAnalyticsContext(admin: SupabaseAdmin, workspaceId: string, accountIds: string[], range: "7d" | "30d" | "90d"): Promise<AssistantAnalyticsContext> {
  const sync = await maybeSyncWorkspaceAnalytics({ workspaceId, accountIds, admin })
  const { data: publishedPosts } = accountIds.length
    ? await admin
      .from("published_posts")
      .select("id, platform, published_at, social_account_id")
      .in("social_account_id", accountIds)
      .limit(500)
    : { data: [] }

  const publishedPostIds = (publishedPosts || []).map((post: { id: string }) => post.id)
  const { data: analyticsRows } = publishedPostIds.length
    ? await admin
      .from("post_analytics")
      .select("published_post_id, views, likes, comments, shares, saves, engagement_rate, synced_at")
      .in("published_post_id", publishedPostIds)
      .limit(500)
    : { data: [] }

  const publishedById = new Map((publishedPosts || []).map((post: Record<string, unknown>) => [post.id, post]))
  const rows = (analyticsRows || []) as Array<Record<string, unknown>>
  const topPosts = rows
    .map((row) => {
      const published = publishedById.get(row.published_post_id)
      const score = numberValue(row.views) + numberValue(row.likes) * 3 + numberValue(row.comments) * 5 + numberValue(row.shares) * 6 + numberValue(row.saves) * 4
      return {
        publishedPostId: text(row.published_post_id, "", 80),
        platform: text(published?.platform, "", 40),
        publishedAt: typeof published?.published_at === "string" ? published.published_at : null,
        views: numberValue(row.views),
        likes: numberValue(row.likes),
        comments: numberValue(row.comments),
        shares: numberValue(row.shares),
        saves: numberValue(row.saves),
        score,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  return {
    range,
    totals: {
      views: rows.reduce((total, row) => total + numberValue(row.views), 0),
      likes: rows.reduce((total, row) => total + numberValue(row.likes), 0),
      comments: rows.reduce((total, row) => total + numberValue(row.comments), 0),
      shares: rows.reduce((total, row) => total + numberValue(row.shares), 0),
      saves: rows.reduce((total, row) => total + numberValue(row.saves), 0),
      publishedPosts: publishedPostIds.length,
      connectedAccounts: accountIds.length,
    },
    topPosts,
    sync,
  }
}

export async function buildAssistantContext({
  workspaceId,
  mode,
  action,
  selectedContext,
  admin = createAdminClient(),
}: {
  workspaceId: string
  mode: AssistantMode
  action: AssistantAction
  selectedContext?: AssistantSelectedContext
  admin?: SupabaseAdmin
}): Promise<AssistantContextPack> {
  const requestedKinds = contextKindsForIntent(mode, action)
  const warnings: string[] = []
  const context: AssistantContextPack = {
    requestedKinds,
    generatedAt: new Date().toISOString(),
    warnings,
  }

  if (requestedKinds.includes("brand")) {
    context.brand = await buildBrandContext(admin, workspaceId)
    if (!context.brand) warnings.push("Brand profile is not configured yet.")
  }

  if (requestedKinds.includes("accounts") || requestedKinds.includes("analytics")) {
    context.accounts = await buildAccountContext(admin, workspaceId)
    if (context.accounts.connectedCount === 0) warnings.push("No Instagram or Facebook accounts are connected.")
  }

  if (requestedKinds.includes("content")) {
    context.content = await buildContentContext(admin, workspaceId, selectedContext)
  }

  if (requestedKinds.includes("automations")) {
    context.automations = await buildAutomationContext(admin, workspaceId)
  }

  if (requestedKinds.includes("analytics")) {
    const accountIds = context.accounts?.items.map((account) => account.id) || []
    const range = selectedContext?.analyticsRange || "30d"
    context.analytics = await buildAnalyticsContext(admin, workspaceId, accountIds, range)
    if (!context.analytics.sync.success) warnings.push("Analytics sync did not complete; cached analytics were used.")
  }

  return context
}
```

- [ ] **Step 2: Add focused context builder tests**

Create `tests/developer-api/assistant-context-packs.test.ts` with a small fake client that supports `from().select().eq().in().order().limit().maybeSingle()` and verifies:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildAssistantContext } from "@/lib/assistant/context-packs"

vi.mock("@/lib/analytics/read-through-sync", () => ({
  maybeSyncWorkspaceAnalytics: vi.fn(async () => ({
    attempted: false,
    success: true,
    skipped: true,
    reason: "fresh_cache",
    checkedAt: "2026-05-15T00:00:00.000Z",
    staleAfterSeconds: 900,
    latestSyncedAt: "2026-05-15T00:00:00.000Z",
  })),
}))

const workspaceId = "workspace-1"

const state = {
  workspace_brand_profiles: [{
    workspace_id: workspaceId,
    business_name: "Aldievlab",
    industry: "AI SaaS",
    brand_voice: "professional",
    language: "en",
    target_audience: "technical founders",
    business_description: "AI-first studio",
    services: ["SaaS builds"],
    unique_selling_points: ["Builder credibility"],
    content_themes: ["AI workflows"],
    brand_colors: { enabled: true, primary: "#050505", secondary: "#A1A1AA", accent: "#00E5FF" },
  }],
  social_accounts: [{ id: "acc-1", workspace_id: workspaceId, platform: "instagram", account_name: "Aldievlab", account_id: "ig-1", metadata: { capabilities: { analytics_read: true } } }],
  posts: [{ id: "post-1", workspace_id: workspaceId, content: "A strong post", media_urls: ["https://x/img.png"], platforms: ["instagram"], status: "scheduled", scheduled_for: "2026-05-19T18:00:00.000Z", published_at: null, updated_at: "2026-05-15T00:00:00.000Z", created_at: "2026-05-15T00:00:00.000Z" }],
  automations: [{ id: "auto-1", workspace_id: workspaceId, name: "Comment reply", type: "comment_to_dm", is_active: true, total_triggered: 12, total_dms_sent: 9, updated_at: "2026-05-15T00:00:00.000Z", created_at: "2026-05-15T00:00:00.000Z" }],
  published_posts: [{ id: "pub-1", social_account_id: "acc-1", platform: "instagram", published_at: "2026-05-14T08:00:00.000Z" }],
  post_analytics: [{ published_post_id: "pub-1", views: 100, likes: 10, comments: 3, shares: 2, saves: 4 }],
} as Record<string, Array<Record<string, unknown>>>

function fakeAdmin() {
  return {
    from(table: string) {
      let rows = [...(state[table] || [])]
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((key: string, value: unknown) => {
          rows = rows.filter((row) => row[key] === value)
          return query
        }),
        in: vi.fn((key: string, values: unknown[]) => {
          rows = rows.filter((row) => values.includes(row[key]))
          return query
        }),
        order: vi.fn(() => query),
        limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: rows[0] || null, error: null })),
      }
      return query
    },
  }
}

describe("buildAssistantContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("builds analyze context with brand, accounts, analytics, and content", async () => {
    const context = await buildAssistantContext({
      workspaceId,
      mode: "analyze",
      action: "analyze_workspace",
      admin: fakeAdmin() as never,
    })

    expect(context.requestedKinds).toEqual(["brand", "accounts", "analytics", "content"])
    expect(context.brand?.businessName).toBe("Aldievlab")
    expect(context.accounts?.connectedCount).toBe(1)
    expect(context.content?.recentPosts[0]).toMatchObject({ id: "post-1", status: "scheduled", mediaCount: 1 })
    expect(context.analytics?.totals).toMatchObject({ views: 100, likes: 10, publishedPosts: 1 })
  })

  it("builds automation context without analytics", async () => {
    const context = await buildAssistantContext({
      workspaceId,
      mode: "operate",
      action: "inspect_automations",
      admin: fakeAdmin() as never,
    })

    expect(context.requestedKinds).toEqual(["brand", "accounts", "automations"])
    expect(context.analytics).toBeUndefined()
    expect(context.automations?.activeCount).toBe(1)
  })
})
```

- [ ] **Step 3: Run tests and commit**

Run:

```bash
pnpm test:ci tests/developer-api/assistant-context-packs.test.ts tests/developer-api/assistant-context-selection.test.ts
```

Expected:

```text
PASS tests/developer-api/assistant-context-packs.test.ts
PASS tests/developer-api/assistant-context-selection.test.ts
```

Commit:

```bash
git add lib/assistant/context-packs.ts tests/developer-api/assistant-context-packs.test.ts
git commit -m "Build assistant context packs"
```

## Task 4: Add Context-Aware Command Route

**Files:**
- Create: `app/api/assistant/command/route.ts`
- Create: `tests/developer-api/assistant-command-route.test.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Add command route**

Create `app/api/assistant/command/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { assertJsonBodySize, sanitizeAssistantInvokePayload } from "@/lib/security/phase1-validation"
import { enforceRateLimit, getClientIp, RateLimitExceededError } from "@/lib/security/rate-limit"
import { routeAssistantIntent } from "@/lib/assistant/intent-router"
import { AssistantAuthError, resolveAssistantWorkspace } from "@/lib/assistant/auth"
import { invokeAssistantEdgeFunction } from "@/lib/assistant/edge-invoke"
import { buildAssistantContext } from "@/lib/assistant/context-packs"
import { summarizeAssistantContext } from "@/lib/assistant/context-selection"
import type { AssistantCommandRequest } from "@/lib/assistant/context-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function readCommandBody(value: unknown): AssistantCommandRequest {
  const body = value && typeof value === "object" ? value as Partial<AssistantCommandRequest> : {}
  const message = typeof body.message === "string" ? body.message.trim() : ""
  if (!message) throw new Error("message is required")
  if (!Array.isArray(body.messages)) throw new Error("messages array is required")

  const routed = routeAssistantIntent({
    message,
    selectedMode: body.mode || "ask",
    overrideFunctionName: body.functionName,
  })

  return {
    message,
    messages: body.messages,
    mode: routed.mode,
    action: routed.action,
    functionName: routed.functionName,
    confidence: routed.confidence,
    needsClarification: routed.needsClarification,
    workspaceId: body.workspaceId,
    selectedContext: body.selectedContext,
  }
}

export async function POST(request: NextRequest) {
  try {
    assertJsonBodySize(request, 256 * 1024)
    const rawBody = await request.json().catch(() => ({}))
    const command = readCommandBody(rawBody)

    if (command.functionName !== "chat-assistant") {
      return NextResponse.json({ error: "assistant command only supports chat-assistant in Phase 2" }, { status: 400 })
    }

    const workspace = await resolveAssistantWorkspace(request, command.workspaceId)
    const clientIp = getClientIp(request)
    await enforceRateLimit(
      { scope: "assistant:command:user", subject: `${workspace.userId}:${workspace.workspaceId}`, limit: 30, windowSeconds: 15 * 60 },
      "Too many AI requests. Please wait a moment and try again.",
    )
    await enforceRateLimit(
      { scope: "assistant:command:ip", subject: clientIp, limit: 60, windowSeconds: 15 * 60 },
      "Too many AI requests. Please wait a moment and try again.",
    )

    const assistantContext = await buildAssistantContext({
      workspaceId: workspace.workspaceId,
      mode: command.mode,
      action: command.action,
      selectedContext: command.selectedContext,
    })
    const contextReceipt = summarizeAssistantContext(assistantContext)

    const invokeBody = {
      ...sanitizeAssistantInvokePayload("chat-assistant", {
        messages: command.messages,
        workspaceId: workspace.workspaceId,
        prompt: command.message,
      }),
      workspaceId: workspace.workspaceId,
      assistantIntent: {
        mode: command.mode,
        action: command.action,
        confidence: command.confidence,
      },
      assistantContext,
    }

    const edgeResult = await invokeAssistantEdgeFunction("chat-assistant", invokeBody)
    if (!edgeResult.ok) {
      const payload = edgeResult.payload && typeof edgeResult.payload === "object" ? edgeResult.payload as { error?: unknown } : {}
      const details = typeof payload.error === "string" ? payload.error : "Context-aware assistant command failed"
      return NextResponse.json({ error: details, contextReceipt }, { status: edgeResult.status >= 400 ? edgeResult.status : 502 })
    }

    return NextResponse.json({
      data: edgeResult.payload,
      assistantIntent: {
        mode: command.mode,
        action: command.action,
        confidence: command.confidence,
      },
      assistantContext,
      contextReceipt,
    })
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } })
    }
    if (error instanceof AssistantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof Error && /message is required|messages array is required|Invalid assistant payload|Request payload too large|Invalid content length/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[assistant/command] unexpected error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 })
  }
}
```

- [ ] **Step 2: Add command route tests**

Create `tests/developer-api/assistant-command-route.test.ts`:

```ts
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const workspaceId = "11111111-1111-4111-8111-111111111111"

const state = vi.hoisted(() => ({
  edgeBody: null as null | Record<string, unknown>,
  contextAction: "",
}))

vi.mock("@/lib/assistant/auth", () => ({
  AssistantAuthError: class AssistantAuthError extends Error {
    constructor(message: string, public status: number) {
      super(message)
    }
  },
  resolveAssistantWorkspace: vi.fn(async () => ({ userId: "user-1", workspaceId })),
}))

vi.mock("@/lib/security/rate-limit", () => ({
  RateLimitExceededError: class RateLimitExceededError extends Error {
    retryAfterSeconds = 30
  },
  enforceRateLimit: vi.fn(async () => undefined),
  getClientIp: vi.fn(() => "127.0.0.1"),
}))

vi.mock("@/lib/assistant/context-packs", () => ({
  buildAssistantContext: vi.fn(async ({ action }: { action: string }) => {
    state.contextAction = action
    return {
      requestedKinds: action === "analyze_workspace" ? ["brand", "accounts", "analytics", "content"] : ["brand", "accounts", "content"],
      brand: { businessName: "Aldievlab", industry: "AI SaaS", brandVoice: "professional", language: "en", targetAudience: "", businessDescription: "", services: [], uniqueSellingPoints: [], contentThemes: [] },
      accounts: { connectedCount: 1, items: [] },
      generatedAt: "2026-05-15T00:00:00.000Z",
      warnings: [],
    }
  }),
}))

vi.mock("@/lib/assistant/edge-invoke", () => ({
  invokeAssistantEdgeFunction: vi.fn(async (_functionName: string, body: Record<string, unknown>) => {
    state.edgeBody = body
    return { ok: true, status: 200, payload: { response: "Context-aware answer" } }
  }),
}))

import * as commandRoute from "@/app/api/assistant/command/route"

describe("assistant command route", () => {
  beforeEach(() => {
    state.edgeBody = null
    state.contextAction = ""
  })

  it("builds analytics context and passes it to chat-assistant", async () => {
    const request = new NextRequest("https://social.swiftdigital-s.com/api/assistant/command", {
      method: "POST",
      body: JSON.stringify({
        message: "Analyze my best posts this month",
        messages: [{ role: "user", content: "Analyze my best posts this month" }],
        mode: "analyze",
        functionName: "chat-assistant",
      }),
    })

    const response = await commandRoute.POST(request)
    expect(response.status).toBe(200)
    expect(state.contextAction).toBe("analyze_workspace")
    expect(state.edgeBody?.assistantContext).toBeTruthy()
    await expect(response.json()).resolves.toMatchObject({
      data: { response: "Context-aware answer" },
      assistantIntent: { mode: "analyze", action: "analyze_workspace" },
      contextReceipt: { packs: ["brand", "accounts", "analytics", "content"] },
    })
  })

  it("rejects specialized function calls in command route", async () => {
    const request = new NextRequest("https://social.swiftdigital-s.com/api/assistant/command", {
      method: "POST",
      body: JSON.stringify({
        message: "Create an image",
        messages: [{ role: "user", content: "Create an image" }],
        mode: "create",
        functionName: "generate-image",
      }),
    })

    const response = await commandRoute.POST(request)
    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 3: Verify Vercel max duration**

If `vercel.json` has a `functions` block, add:

```json
"app/api/assistant/command/route.ts": {
  "maxDuration": 60
}
```

If the route-level `export const maxDuration = 60` is already enough for this project’s current Vercel config pattern, leave `vercel.json` unchanged.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
pnpm test:ci tests/developer-api/assistant-command-route.test.ts
```

Expected:

```text
PASS tests/developer-api/assistant-command-route.test.ts
```

Commit:

```bash
git add app/api/assistant/command/route.ts tests/developer-api/assistant-command-route.test.ts vercel.json
git commit -m "Add context-aware assistant command route"
```

Only include `vercel.json` if it changed.

## Task 5: Teach the Chat Edge Function to Use Context

**Files:**
- Modify: `supabase/functions/chat-assistant/index.ts`

- [ ] **Step 1: Extend request parsing**

In `supabase/functions/chat-assistant/index.ts`, change:

```ts
const { messages, workspaceId } = await req.json()
```

to:

```ts
const { messages, workspaceId, assistantContext, assistantIntent } = await req.json()
```

- [ ] **Step 2: Add a compact context formatter**

Add before `serve(async (req) => {`:

```ts
function safeList(value: unknown, limit = 8): string {
    return Array.isArray(value)
        ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, limit).join(', ')
        : ''
}

function formatAssistantContext(context: unknown, intent: unknown): string {
    if (!context || typeof context !== 'object') return ''
    const ctx = context as Record<string, any>
    const lines: string[] = []
    const intentRecord = intent && typeof intent === 'object' ? intent as Record<string, unknown> : {}
    if (intentRecord.mode || intentRecord.action) {
        lines.push(`Intent: mode=${intentRecord.mode || 'unknown'}, action=${intentRecord.action || 'unknown'}`)
    }

    const brand = ctx.brand || {}
    if (brand.businessName || brand.industry || brand.brandVoice) {
        lines.push(`Brand: ${brand.businessName || 'Workspace'}; industry=${brand.industry || 'unknown'}; voice=${brand.brandVoice || 'professional'}; audience=${brand.targetAudience || 'not specified'}`)
    }
    if (brand.businessDescription) lines.push(`Brand description: ${String(brand.businessDescription).slice(0, 600)}`)
    if (Array.isArray(brand.contentThemes) && brand.contentThemes.length) lines.push(`Content themes: ${safeList(brand.contentThemes, 10)}`)
    if (Array.isArray(brand.uniqueSellingPoints) && brand.uniqueSellingPoints.length) lines.push(`Unique selling points: ${safeList(brand.uniqueSellingPoints, 8)}`)

    const accounts = ctx.accounts || {}
    if (Array.isArray(accounts.items)) {
        lines.push(`Connected accounts: ${accounts.items.map((item: any) => `${item.platform}:${item.accountName || item.accountId}`).join(', ') || 'none'}`)
    }

    const content = ctx.content || {}
    if (Array.isArray(content.recentPosts) && content.recentPosts.length) {
        lines.push(`Recent posts: ${content.recentPosts.slice(0, 8).map((post: any) => `[${post.status}] ${String(post.content || '').slice(0, 140)}`).join(' | ')}`)
    }

    const analytics = ctx.analytics || null
    if (analytics?.totals) {
        lines.push(`Analytics ${analytics.range || '30d'} totals: views=${analytics.totals.views || 0}, likes=${analytics.totals.likes || 0}, comments=${analytics.totals.comments || 0}, shares=${analytics.totals.shares || 0}, saves=${analytics.totals.saves || 0}, publishedPosts=${analytics.totals.publishedPosts || 0}`)
    }
    if (Array.isArray(analytics?.topPosts) && analytics.topPosts.length) {
        lines.push(`Top posts: ${analytics.topPosts.slice(0, 5).map((post: any) => `${post.platform || 'platform'} views=${post.views || 0} likes=${post.likes || 0} comments=${post.comments || 0}`).join(' | ')}`)
    }

    const automations = ctx.automations || {}
    if (Array.isArray(automations.items)) {
        lines.push(`Automations: ${automations.items.slice(0, 8).map((item: any) => `${item.isActive ? 'active' : 'paused'} ${item.name} (${item.type}) triggers=${item.totalTriggered || 0}`).join(' | ') || 'none'}`)
    }

    if (Array.isArray(ctx.warnings) && ctx.warnings.length) {
        lines.push(`Context warnings: ${safeList(ctx.warnings, 5)}`)
    }

    return lines.length
        ? `\n\nWorkspace context for this answer:\n${lines.map((line) => `- ${line}`).join('\n')}\n\nUse this context when relevant. If context is missing or partial, say that clearly. Do not claim live data beyond these provided facts.`
        : ''
}
```

- [ ] **Step 3: Append context to system instruction**

After `const languageName = LANGUAGE_NAMES[language] || 'English'`, add:

```ts
const contextInstruction = formatAssistantContext(assistantContext, assistantIntent)
```

Then append it to `systemInstruction`:

```ts
7. ALL content must be in ${languageName}.${contextInstruction}`
```

- [ ] **Step 4: Deploy or stage Edge Function**

Do not deploy the Edge Function until the app route and client tests pass. At final deployment, run the existing deployment command used for this project:

```bash
pnpm run deploy:mcp
```

Expected:

```text
Supabase functions deployment succeeds
```

- [ ] **Step 5: Commit Edge Function context support**

Commit:

```bash
git add supabase/functions/chat-assistant/index.ts
git commit -m "Pass assistant context into chat responses"
```

## Task 6: Wire Client to Command Route and Render Context Receipt

**Files:**
- Create: `app/dashboard/assistant/components/command-center/context-receipt.tsx`
- Modify: `app/dashboard/assistant/chat-interface.tsx`

- [ ] **Step 1: Create context receipt component**

Create `app/dashboard/assistant/components/command-center/context-receipt.tsx`:

```tsx
'use client'

import { Database, AlertCircle } from 'lucide-react'
import type { AssistantContextReceipt } from '@/lib/assistant/context-types'

interface AssistantContextReceiptProps {
  receipt?: AssistantContextReceipt
}

export function AssistantContextReceiptView({ receipt }: AssistantContextReceiptProps) {
  if (!receipt) return null

  return (
    <div className="mt-2 flex max-w-full flex-wrap items-center gap-1.5 text-[11px] text-white/38">
      <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/4 px-2 py-1">
        <Database className="h-3 w-3 text-cyan-200/70" />
        {receipt.label}
      </span>
      {receipt.analyticsSyncReason && (
        <span className="rounded-full border border-white/8 bg-white/4 px-2 py-1">
          analytics: {receipt.analyticsSyncReason}
        </span>
      )}
      {receipt.warnings.slice(0, 2).map((warning) => (
        <span key={warning} className="inline-flex items-center gap-1 rounded-full border border-amber-400/15 bg-amber-400/8 px-2 py-1 text-amber-100/70">
          <AlertCircle className="h-3 w-3" />
          {warning}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Add command invoker to chat interface**

In `app/dashboard/assistant/chat-interface.tsx`, import:

```ts
import { AssistantContextReceiptView } from './components/command-center/context-receipt'
import type { AssistantCommandResponse } from '@/lib/assistant/context-types'
```

Add helper near `invokeEdge`:

```ts
const invokeCommand = async (body: Record<string, unknown>): Promise<AssistantCommandResponse> => {
    const response = await fetch('/api/assistant/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

    let payload: any = null
    try {
        payload = await response.json()
    } catch {
        payload = null
    }

    if (!response.ok) {
        throw new Error(payload?.error || 'Assistant command failed')
    }

    return payload as AssistantCommandResponse
}
```

- [ ] **Step 3: Use command route for chat-assistant only**

In `handleSend`, replace:

```ts
const data = await invokeEdge(targetFunction, {
```

with:

```ts
const commandBody = {
    messages: newMessages,
    workspaceId,
    message: messageText,
    mode: routedIntent.mode,
    action: routedIntent.action,
    functionName: targetFunction,
    confidence: routedIntent.confidence,
    needsClarification: routedIntent.needsClarification,
    prompt: messageText,
    assistantIntent: {
        mode: routedIntent.mode,
        action: routedIntent.action,
        confidence: routedIntent.confidence,
    },
    ...extraPayload
}

const commandResponse = targetFunction === 'chat-assistant'
    ? await invokeCommand(commandBody)
    : null

const data = commandResponse
    ? commandResponse.data as any
    : await invokeEdge(targetFunction, commandBody) as any
```

Then when creating `finalMessages`, attach the receipt:

```ts
const finalMessages: AssistantMessage[] = [...newMessages, {
    role: 'assistant',
    content: responseContent,
    type: responseType,
    data: responseData,
    contextReceipt: commandResponse?.contextReceipt,
}]
```

- [ ] **Step 4: Render context receipts**

Under the assistant message bubble content block, after structured renderers, add:

```tsx
{msg.role === 'assistant' && (
  <AssistantContextReceiptView receipt={msg.contextReceipt} />
)}
```

Place it inside the message content column so it aligns with the assistant bubble and does not appear under user messages.

- [ ] **Step 5: Run lint and commit**

Run:

```bash
pnpm exec eslint app/dashboard/assistant/chat-interface.tsx app/dashboard/assistant/components/command-center/context-receipt.tsx
```

Expected:

```text
No new lint errors. Existing no-img-element warnings in assistant previews are acceptable.
```

Commit:

```bash
git add app/dashboard/assistant/chat-interface.tsx app/dashboard/assistant/components/command-center/context-receipt.tsx
git commit -m "Show assistant context receipts"
```

## Task 7: Final Verification

**Files:**
- Read/verify all Phase 2 changed files

- [ ] **Step 1: Run focused assistant tests**

Run:

```bash
pnpm test:ci tests/developer-api/assistant-context-selection.test.ts tests/developer-api/assistant-context-packs.test.ts tests/developer-api/assistant-command-route.test.ts tests/developer-api/assistant-intent-router.test.ts
```

Expected:

```text
All focused assistant tests pass.
```

- [ ] **Step 2: Run broader developer API tests**

Run:

```bash
pnpm test:ci tests/developer-api
```

Expected:

```text
All developer API tests pass.
```

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm test:ci
pnpm build
```

Expected:

```text
All Vitest tests pass.
Production build passes.
```

- [ ] **Step 4: Browser smoke test with authenticated session**

Start local dev server:

```bash
pnpm dev
```

Open:

```text
http://localhost:3000/dashboard/assistant
```

Verify:

1. Ask: `Analyze my best posts this month`.
   - Response uses analytics/workspace-specific facts.
   - A context receipt appears under the assistant reply.
   - Receipt includes analytics sync reason.

2. Ask: `Show my scheduled posts`.
   - Response references posts/drafts/scheduled posts.
   - No write action is taken.

3. Ask: `Review my active automations`.
   - Response references automation names/status counts.
   - No activation or deletion occurs.

4. Ask a normal creation request like `Create a post about AI workflows`.
   - Chat-assistant uses brand context.
   - Existing image/carousel/ideas flows still work.

5. Mobile viewport:
   - Context receipts wrap cleanly.
   - Composer remains reachable.
   - No text overlap under long warning labels.

- [ ] **Step 5: Deploy Edge Function if required**

If local and production app route tests pass, deploy the updated Supabase function:

```bash
pnpm run deploy:mcp
```

Expected:

```text
Deployment succeeds.
```

- [ ] **Step 6: Push to master**

Run:

```bash
git status --short
git log --oneline origin/master..HEAD
git push origin HEAD:master
```

Expected:

```text
Only intended Phase 2 files are committed.
HEAD -> master
```

- [ ] **Step 7: Save Vault memory**

Save a Vault memory:

```json
{
  "project": "Social-Media-Manager-AI-Tool",
  "subject": "AI Assistant Command Center Phase 2",
  "title": "Implemented AI Assistant Phase 2 context-aware command route",
  "summary": "Implemented server-side assistant context packs, command route, read-through analytics context, chat-assistant context grounding, and UI context receipts while keeping all write actions out of scope.",
  "tags": ["ai-assistant", "command-center", "context-engine", "analytics", "mobile"],
  "related_files": [
    "app/api/assistant/command/route.ts",
    "lib/assistant/context-packs.ts",
    "lib/assistant/context-types.ts",
    "lib/assistant/context-selection.ts",
    "supabase/functions/chat-assistant/index.ts",
    "app/dashboard/assistant/chat-interface.tsx"
  ]
}
```

## Plan Self-Review

Spec coverage:

1. Context engine is covered by Tasks 1 and 3.
2. Backend command route is covered by Task 4.
3. Existing flow preservation is covered by using `/api/assistant/command` only for `chat-assistant` and leaving specialized flows on `/api/assistant/invoke`.
4. Analytics freshness is covered by `maybeSyncWorkspaceAnalytics` inside the analytics context builder.
5. UI transparency is covered by the context receipt component.
6. Write confirmations are intentionally left out of Phase 2 and reserved for Phase 3.

Placeholder scan:

No placeholder markers are present. Each task names exact files, concrete snippets, commands, expected results, and commit boundaries.

Type consistency:

The plan uses `AssistantCommandRequest`, `AssistantCommandResponse`, `AssistantContextPack`, `AssistantContextReceipt`, `AssistantSelectedContext`, and Phase 1 `AssistantIntent` fields consistently across route, builder, UI, and tests.
