# Injection Analysis Report (SQLi & Command Injection)

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** No SQL injection vulnerabilities were identified — the application exclusively uses the Supabase parameterized query builder with no raw SQL construction. However, **five high-to-medium confidence injection vulnerabilities** of other classes were confirmed: four URL **Path Traversal** findings injecting attacker-controlled path segments into outbound Meta Graph API calls, one **HTTP Header Injection** on an unauthenticated endpoint, and one disabled SSRF vector whose payload storage path is still live. All confirmed externally exploitable findings have been passed to the exploitation phase via `deliverables/injection_exploitation_queue.json`.
- **Purpose of this Document:** This report provides strategic context, dominant vulnerability patterns, and defensive intelligence necessary to weaponize the confirmed vulnerabilities. It must be read alongside the JSON queue.

---

## 2. Dominant Vulnerability Patterns

### Pattern A — Unsanitized ID Parameters Directly Interpolated into Outbound API URL Paths

- **Description:** Multiple API routes accept user-supplied identifier parameters (`platform_post_id`, `postId`, `commentId`) and interpolate them directly into Meta Graph API URL paths using template literals (e.g., `` `${META_GRAPH_URL}/${postId}/comments` ``). No format validation is performed on any of these parameters — they are not checked to be numeric, to match a `{page_id}_{post_id}` Meta format, or to be free of path separator characters (`/`, `..`, `?`, `&`, `#`).
- **Implication:** An attacker with a workspace member session can inject path traversal sequences (e.g., `123/../me/accounts`) or query-string metacharacters into the outbound URL, potentially reaching arbitrary Meta Graph API endpoints that the workspace's page-access-token authorizes, including profile data, connected pages, ad accounts, and token introspection endpoints.
- **Representative Finding:** INJ-VULN-03 (postId path traversal, GET /api/posts-media/comments), INJ-VULN-04 (commentId, POST/DELETE/PATCH), INJ-VULN-02 (platform_post_id, POST /api/automations)

### Pattern B — No Private-IP / Scheme Validation on HTTP URL Inputs

- **Description:** The `sanitizeHttpUrl()` function in `lib/security/phase1-validation.ts:65-77` only checks that the URL protocol is `http:` or `https:`. It does not block private RFC-1918 ranges, link-local metadata addresses (169.254.169.254), or localhost. This same function validates `mediaUrls[]` in the post creation flow. The validated URLs are later forwarded to the Meta Graph API as `image_url`/`video_url` payload fields.
- **Implication:** An attacker can store a valid-looking `http://169.254.169.254/...` URL as a post's media URL. When the scheduled-post Edge Function fires, Meta's infrastructure fetches the URL — acting as a blind SSRF relay. While the application server itself does not fetch the URL, this can be used to probe Meta's internal network or cloud-metadata services.
- **Representative Finding:** INJ-VULN-05

### Pattern C — Unauthenticated Outbound Request Construction from User Input

- **Description:** The `POST /api/ai/validate-key` endpoint is publicly accessible without authentication. It accepts `provider` and `apiKey` fields, applies only `.trim()` and quote-stripping, then inserts `apiKey` verbatim into an `Authorization: Bearer <apiKey>` HTTP header before making outbound calls to OpenRouter, OpenAI, or Gemini.
- **Implication:** No CRLF check is applied. If the underlying Node.js `fetch()` implementation (Undici ≥ 6) does not sanitize header values, an attacker can inject arbitrary HTTP headers into the outbound request via `\r\n` sequences in `apiKey` from the public internet with no login required.
- **Representative Finding:** INJ-VULN-01

### Pattern D — SSRF Payload Storage Without Sanitization (Disabled Execution)

- **Description:** The `workflow_graph` object from `POST /api/automations` and `PUT /api/automations/[id]` is stored in the database as-is (no node-config validation). The `action_http_request` node type — which would pass `config.url`, `config.method`, `config.headers`, `config.body` directly to `fetch()` — is listed in `TEMP_DISABLED_ACTION_TYPES` and returns early with an error before execution. However, the code for full SSRF execution (graph-executor.ts:1066 and automation-worker-http-request/index.ts:29) remains live.
- **Implication:** The SSRF is presently neutralized by a soft flag; if the flag is removed (a one-line code change) or if the Supabase Edge Function endpoint is directly reachable, stored payloads immediately become live SSRF. Requires admin/owner role to store.
- **Representative Finding:** INJ-VULN-06 (not in queue — not currently externally exploitable)

---

## 3. Strategic Intelligence for Exploitation

### Meta Graph API Path Traversal — Exploitation Approach

- **Access Token Context:** All outbound Meta API calls use the workspace's decrypted page access token. Path traversal payloads reach the Meta Graph API with a **valid, authenticated Bearer token** for the connected Facebook page / Instagram account. The token's authorized scopes (pages_manage_posts, instagram_basic, pages_messaging, instagram_manage_comments) determine what traversal targets are accessible.
- **High-Value Traversal Targets:**
  - `{id}/../me` → Resolves to `/me` — returns the token owner's profile
  - `{id}/../me/accounts` → Returns all connected Facebook pages with their own page tokens
  - `{id}/../me/adaccounts` → Lists ad accounts linked to the user
  - `{id}/../debug_token?input_token={token}` → Token introspection (can expose token details)
- **Recommended Payload Structure:** Use a known real post ID as prefix followed by `/../` to ensure the base segment is valid before traversal: `POST_ID/../TARGET_ENDPOINT`. URL-encode traversal sequences if the client pre-sanitizes: `POST_ID/%2e%2e/TARGET`.
- **No WAF Observed:** No evidence of a WAF on the Next.js application layer. Traversal payloads should reach the backend code unmodified.
- **Error Visibility:** Meta Graph API errors (404, 400, token scope errors) are surfaced in the response JSON from the Next.js API routes, providing direct feedback on traversal success.

### HTTP Header Injection — Exploitation Approach

- **Unauthenticated Surface:** The `/api/ai/validate-key` endpoint requires zero authentication, making it directly exploitable from the internet.
- **Runtime Dependency:** Exploitability depends on the Node.js version's Undici implementation. Node.js 18 with Undici < 6 does not fully sanitize CRLF sequences in header values; Node.js 22+ Undici 6+ may block them. The Vercel serverless runtime for this app should be identified to confirm.
- **Confirmed Targets:** OpenRouter (`https://openrouter.ai/api/v1/key`), OpenAI (`https://api.openai.com/v1/models`). For Gemini, `apiKey` is placed in a URL query parameter — separate URL parameter injection vector.
- **Witness Payload:** `apiKey = "sk-test\r\nX-Injected: evil"` for header injection; `apiKey = "key&extraParam=injected"` for Gemini URL parameter injection.

### Blind SSRF via Meta mediaUrls — Exploitation Approach

- **Indirect Nature:** The application server does NOT fetch the URL — Meta's infrastructure does. Exploitability depends on Meta's server environment having access to the target network (e.g., cloud metadata at 169.254.169.254). This is a **blind, delayed SSRF** that fires when the post's scheduled time is reached.
- **Timing:** The SSRF executes when the `process-scheduled-posts` Edge Function runs, triggered by the cron scheduler or manual `POST /api/cron/scheduler`.
- **Target:** Cloud metadata endpoints: `http://169.254.169.254/latest/meta-data/iam/security-credentials/` (AWS) or GCP equivalent.

### SQL Injection — Not Present

- The entire codebase uses Supabase's JavaScript query builder (`.eq()`, `.select()`, `.insert()`, `.update()`) with parameterized binds throughout.
- No raw SQL string construction, no `.rpc()` with user-controlled arguments, no `textSearch()` with unsanitized input.
- **Conclusion:** SQL injection is not a viable attack vector.

---

## 4. Vectors Analyzed and Confirmed Secure

These input vectors were fully traced and confirmed to have robust, context-appropriate defenses. They are **low-priority** for further testing.

| **Source (Parameter/Key)** | **Endpoint / File Location** | **Defense Mechanism Implemented** | **Verdict** |
|---|---|---|---|
| `workspaceId` | GET /api/workspace/settings, GET /api/brand/social-status | UUID format + `requireWorkspacePermission()` RBAC check before DB query | SAFE |
| `id` (automation) | GET/PUT/DELETE /api/automations/[id] | `.eq('id', id).eq('workspace_id', activeWorkspace.id)` workspace-scoped query | SAFE |
| `id` (chat session) | GET/PATCH/DELETE /api/chat/sessions/[id] | `.eq('id', id).eq('workspace_id', activeWorkspace.id)` workspace-scoped query | SAFE |
| `id` (external service) | PUT/DELETE /api/external-services/[id] | `.eq('id', id).eq('workspace_id', workspaceId)` workspace-scoped query | SAFE |
| `conversationId` (SELECT) | GET /api/messages | `.eq('conversation_id', conversationId).eq('workspace_id', activeWorkspace.id)` | SAFE (SELECT only; UPDATE lacks filter — auth issue, not SQLi) |
| `account_id` | GET /api/automations/instagram-media, /automations/media | UUID validated + `.eq('workspace_id', activeWorkspace.id)` DB scope | SAFE |
| `sessionId` | GET /api/auth/meta/page-session | `sanitizeMetaPageSessionId()` validates UUID format before DB lookup | SAFE |
| `workflow_graph` (DB write) | POST /api/automations, PUT /api/automations/[id] | Stored as JSONB via parameterized insert; no raw SQL construction | SAFE (SQLi scope) |
| `messages[].content` | POST /api/chat/sessions, PATCH /api/chat/sessions/[id] | Stored via parameterized Supabase insert | SAFE |
| `topic`, `platform` | POST /api/ai/generate-ideas (generateIdeasAction) | Passed to LLM prompt only — no DB sink | SAFE (SQLi/CMDi scope) |
| `automation_id` | POST /api/automations/process | Passed to Edge Function via service-role call; workspace check in orchestrator | SAFE (SQLi scope) |
| `status` (post) | POST/PUT /api/posts | Validated against enum in phase1-validation.ts before DB write | SAFE |
| `scheduledAt` | PATCH /api/posts | Cast to Date via `new Date()` before parameterized DB insert | SAFE |
| `hub.verify_token` | GET /api/webhooks/instagram | Compared against env var only — not used in DB query | SAFE |
| `code`, `state` | GET /api/auth/meta/callback | PKCE code exchange via Supabase Auth; state validated against nonce cookie | SAFE |
| `interpolateTemplate()` output | automation-worker-send-email/index.ts | Output used only for email body/subject — no DB or shell sink | SAFE (SQLi/CMDi scope) |

---

## 5. Detailed Findings

### INJ-VULN-01 — HTTP Header Injection via `apiKey` (Unauthenticated)

| Field | Value |
|---|---|
| **ID** | INJ-VULN-01 |
| **Type** | CommandInjection (HTTP header injection into outbound request) |
| **Source** | `apiKey` — POST body, `app/api/ai/validate-key/route.ts:10` |
| **Sink** | `fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: \`Bearer ${trimmedKey}\` } })` — `route.ts:26-28` |
| **Slot Type** | CMD-part-of-string |
| **Sanitization** | `.trim().replace(/^['"]|['"]\$/g, "")` at `route.ts:16` — strips whitespace and quotes only; no CRLF check |
| **Verdict** | Vulnerable |
| **Mismatch Reason** | The `apiKey` value is interpolated into an HTTP header value string without stripping or rejecting CRLF sequences (`\r\n`). If Node.js/Undici allows embedded CRLF in header values, arbitrary headers are injected into the outbound request. Applies to OpenRouter (line 27), OpenAI (line 49), and Gemini URL parameter (line 70). |
| **Witness Payload** | `{"provider":"openrouter","apiKey":"sk-test\r\nX-Injected: evil\r\nContent-Length: 0"}` |
| **Confidence** | Medium (runtime behavior depends on Node.js/Undici version) |
| **Auth Required** | None — fully unauthenticated public endpoint |
| **Externally Exploitable** | true |

---

### INJ-VULN-02 — Path Traversal via `platform_post_id` in Meta Graph API URL

| Field | Value |
|---|---|
| **ID** | INJ-VULN-02 |
| **Type** | PathTraversal |
| **Source** | `platform_post_id` — POST body, `app/api/automations/route.ts:135` |
| **Sink** | `` `${META_GRAPH_API_BASE_URL}/${platform_post_id}/comments?...` `` → `fetch(testUrl)` — `route.ts:242-243` |
| **Slot Type** | PATH-component |
| **Sanitization** | None — no format validation on `platform_post_id` before URL construction |
| **Verdict** | Vulnerable |
| **Mismatch Reason** | User-supplied `platform_post_id` is interpolated directly into the Meta Graph API URL path segment without any format check (not required to be numeric, no `../` filtering, no URL encoding). Allows traversal to arbitrary Meta Graph endpoints using the workspace's page-access-token. |
| **Witness Payload** | `{"platform_post_id":"123456789_987/../me/accounts","name":"test","social_account_id":"<uuid>","dm_config":{}}` |
| **Confidence** | High |
| **Auth Required** | `automation:write` (admin or owner role in workspace) |
| **Externally Exploitable** | true |

---

### INJ-VULN-03 — Path Traversal via `postId` in Meta Graph API URL (GET /api/posts-media/comments)

| Field | Value |
|---|---|
| **ID** | INJ-VULN-03 |
| **Type** | PathTraversal |
| **Source** | `postId` — query param, `app/api/posts-media/comments/route.ts:74` |
| **Sink** | `` `${META_GRAPH_URL}/${postId}/comments?...` `` → `fetch(url)` — `route.ts:115` (Instagram), `route.ts:145` (Facebook) |
| **Slot Type** | PATH-component |
| **Sanitization** | None — no format validation on `postId` |
| **Verdict** | Vulnerable |
| **Mismatch Reason** | `postId` is retrieved directly from query string and interpolated into the Meta Graph API URL path with no format check. Both Instagram and Facebook code paths are affected. Traversal sequences or metacharacters reach Meta's servers with the workspace's access token. |
| **Witness Payload** | `GET /api/posts-media/comments?postId=123456789_987/../me/accounts&platform=instagram` |
| **Confidence** | High |
| **Auth Required** | Workspace member (any authenticated role, no explicit RBAC check on GET) |
| **Externally Exploitable** | true |

---

### INJ-VULN-04 — Path Traversal via `commentId` in Meta Graph API URL (POST/DELETE/PATCH)

| Field | Value |
|---|---|
| **ID** | INJ-VULN-04 |
| **Type** | PathTraversal |
| **Combined Sources** | POST: `commentId` from request body (route.ts:212); DELETE: `commentId` from query string (route.ts:303); PATCH: `commentId` from request body (route.ts:376) |
| **Source** | `commentId` — body/query, `app/api/posts-media/comments/route.ts:212/303/376` |
| **Sink** | POST: `` `${META_GRAPH_URL}/${commentId}/replies` `` → fetch() at `route.ts:247,252`; DELETE: `` `${META_GRAPH_URL}/${commentId}?...` `` → fetch() at `route.ts:335-336`; PATCH: `` `${META_GRAPH_URL}/${commentId}?...` `` → fetch() at `route.ts:410-411` |
| **Slot Type** | PATH-component |
| **Sanitization** | None on any of the three methods — no format validation, no encoding, no allowlist |
| **Verdict** | Vulnerable |
| **Mismatch Reason** | Three distinct HTTP methods (POST, DELETE, PATCH) all interpolate `commentId` directly into the Meta Graph URL path. No validation that the value is numeric or free of path separators. TypeScript cast (`as string`) at PATCH line 376 provides zero runtime validation. |
| **Witness Payload** | `DELETE /api/posts-media/comments?commentId=123/../../../me&platform=facebook` |
| **Confidence** | High |
| **Auth Required** | `content:write` (editor role or above) |
| **Externally Exploitable** | true |

---

### INJ-VULN-05 — Blind SSRF via `mediaUrls[]` Forwarded to Meta Publishing API

| Field | Value |
|---|---|
| **ID** | INJ-VULN-05 |
| **Type** | LFI (blind SSRF — Meta's servers fetch the URL) |
| **Source** | `mediaUrls[]` — POST body, `app/api/posts/route.ts:48` via `sanitizePostPayload()` |
| **Path** | POST /api/posts → `sanitizePostPayload()` (phase1-validation.ts:351-354) → DB storage (`posts` table) → cron scheduler → `process-scheduled-posts` Edge Function (index.ts:517) → `utils/meta-publish.ts:188/281/398/562` → Meta Graph API `image_url`/`video_url`/`file_url` field |
| **Sink** | Meta Graph API publishing call: `image_url: imageUrl` at `meta-publish.ts:188`; forwarded to Meta's servers for content fetch |
| **Slot Type** | FILE-path |
| **Sanitization** | `sanitizeHttpUrl()` at `phase1-validation.ts:65-77` — checks `http:` or `https:` protocol only; **no private IP range block, no RFC-1918 rejection, no metadata IP block** |
| **Verdict** | Vulnerable |
| **Mismatch Reason** | `sanitizeHttpUrl()` restricts scheme to http/https but does not block private IP ranges (127.0.0.1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254). The validated URL is stored in the DB and later sent as `image_url` to Meta's API. Meta's infrastructure (potentially in AWS/GCP) then fetches the URL — acting as a blind SSRF proxy. |
| **Witness Payload** | `{"mediaUrls":["http://169.254.169.254/latest/meta-data/iam/security-credentials/"],"platforms":["instagram"],"status":"scheduled","scheduledAt":"2026-12-01T00:00:00Z"}` |
| **Confidence** | Medium (SSRF depends on Meta's server environment; blind — no direct response) |
| **Auth Required** | `content:write` (editor role or above) |
| **Externally Exploitable** | true |

---

### INJ-VULN-06 — SSRF via `workflow_graph.config.url` (Execution Currently Disabled)

| Field | Value |
|---|---|
| **ID** | INJ-VULN-06 |
| **Type** | PathTraversal / SSRF |
| **Source** | `workflow_graph.nodes[].data.config.url` — POST/PUT body, `app/api/automations/route.ts:135`, `app/api/automations/[id]/route.ts:94` |
| **Path** | POST/PUT /api/automations → DB storage (`workflow_graph` JSONB) → automation-orchestrator → automation-worker-run → `executeWorkflowGraph()` (graph-executor.ts:339) → `executeNode()` (graph-executor.ts:643) → `executeHttpRequest(config)` (graph-executor.ts:1052) → `fetch(config.url, options)` |
| **Sink** | `fetch(config.url, options)` — `supabase/functions/process-automations/graph-executor.ts:1066`; also `fetch(String(config.url || ''), options)` — `supabase/functions/automation-worker-http-request/index.ts:29` |
| **Slot Type** | PATH-component |
| **Sanitization** | None on any of: URL, method, headers, body — throughout entire chain |
| **Disable Mitigation** | `TEMP_DISABLED_ACTION_TYPES = new Set(['action_http_request'])` at `graph-executor.ts:33-35`; early return check at `graph-executor.ts:654-660` prevents execution |
| **Verdict** | Vulnerable (code path exists; execution blocked by soft flag) |
| **Mismatch Reason** | Zero URL validation exists anywhere in the chain. The disable is a single in-memory Set check — easily reversible. The `automation-worker-http-request` Edge Function itself has no authentication checks and CORS `*`, meaning it may be callable directly if the Supabase project URL is known. |
| **Witness Payload** | `{"workflow_graph":{"nodes":[{"id":"n1","data":{"type":"action_http_request","config":{"url":"http://169.254.169.254/latest/meta-data/","method":"GET"}}}]}}` |
| **Confidence** | High (code confirmed; disabled by flag only) |
| **Auth Required** | `automation:write` (admin or owner role) |
| **Externally Exploitable** | false (currently disabled; Edge Function requires internal Supabase access) |

---

## 6. Analysis Constraints and Blind Spots

- **SSRF Disable Flag Fragility:** The `TEMP_DISABLED_ACTION_TYPES` check is the only barrier between stored SSRF payloads and live execution. It is a code-level soft flag with no persistence. Any future code change removing this Set, or any direct invocation of the `automation-worker-http-request` Edge Function via its Supabase endpoint, would immediately activate stored SSRF payloads.

- **automation-worker-http-request Direct Invocability:** The agent confirmed this Edge Function has NO authentication checks and sets `Access-Control-Allow-Origin: *`. If the Supabase project URL is discoverable (e.g., from browser network traffic or `.env.local`), this function can be invoked directly from the internet regardless of the disabled flag in graph-executor.

- **Supabase Edge Function Visibility:** The analysis could not fully enumerate whether all Edge Functions are protected by Supabase JWT verification or if they accept unauthenticated calls via the anon key. This remains a potential blind spot for the automation worker functions.

- **Meta Graph API Path Traversal Depth:** The actual endpoints reachable via path traversal depend on the workspace's page-access-token scopes. Full scope enumeration was not performed; the analysis is based on the documented scopes from the recon deliverable.

- **Gemini URL Parameter Injection:** `apiKey` is placed in the URL query string for Gemini (`?key=${trimmedKey}`) at `validate-key/route.ts:70`. This is a URL parameter injection sub-vector of INJ-VULN-01, distinct from the header injection path for OpenRouter/OpenAI. Same unauthenticated surface.

- **Prompt Injection / LLM Jailbreak (Out of Scope):** Webhook comment/message text flows unescaped into LLM prompt construction (`automation-context.ts:89,91,118`). This is a confirmed content injection but falls outside the SQLi/CMDi/LFI/PathTraversal/SSTI/Deserialization scope and is documented here for completeness only.

- **Email Template Content Injection (Out of Scope):** `interpolateTemplate()` substitutes webhook comment/message text into email subjects/bodies without sanitization (`automation-worker-send-email/index.ts:43-44`). Plain-text email bodies lack HTML escaping and may allow SMTP header injection via newline sequences in comment text. Out of scope for this analysis.
