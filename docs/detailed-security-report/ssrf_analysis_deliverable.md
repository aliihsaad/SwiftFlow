# SSRF Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** Multiple server-side request forgery vulnerabilities were identified across two dominant patterns: (1) a disabled-but-coded unrestricted fetch SSRF in the automation HTTP worker, and (2) Meta Graph API path-traversal injection across five authenticated endpoints enabling API_Proxy_Bypass. A third pattern of blind SSRF via Meta as proxy was also confirmed through the media publishing pipeline.
- **Purpose of this Document:** This report provides the strategic context on the application's outbound request mechanisms, dominant flaw patterns, and key architectural details necessary to effectively exploit the vulnerabilities listed in the exploitation queue.

**Findings at a Glance:**

| ID | Endpoint | Type | Severity | Auth Required | Externally Exploitable |
|---|---|---|---|---|---|
| SSRF-VULN-01 | `POST /api/automations` | URL_Manipulation | Critical | Yes (automation:write) | No (disabled) |
| SSRF-VULN-02 | `POST /api/automations` | API_Proxy_Bypass | High | Yes (automation:write) | Yes |
| SSRF-VULN-03 | `GET /api/posts-media/comments` | API_Proxy_Bypass | High | Yes (content:write) | Yes |
| SSRF-VULN-04 | `POST /api/posts-media/comments` | API_Proxy_Bypass | High | Yes (content:write) | Yes |
| SSRF-VULN-05 | `DELETE /api/posts-media/comments` | API_Proxy_Bypass | High | Yes (content:write) | Yes |
| SSRF-VULN-06 | `PATCH /api/posts-media/comments` | API_Proxy_Bypass | High | Yes (content:write) | Yes |
| SSRF-VULN-07 | `POST /api/posts` | File_Fetch_Abuse | Medium | Yes (content:write) | Yes |

---

## 2. Dominant Vulnerability Patterns

### Pattern 1: Unrestricted fetch() in Automation HTTP Worker (Disabled)

- **Description:** The application implements an automation workflow engine supporting an `action_http_request` node type. When executed, the node's `config.url` (fully attacker-controlled) is passed with zero sanitization to Deno's `fetch()` inside the `automation-worker-http-request` Edge Function. All request parameters—URL, method, headers, body—originate from the stored workflow graph with no URL scheme check, no private IP range validation, no domain allowlist, and no port restriction. An identical fallback execution path exists in `supabase/functions/process-automations/graph-executor.ts:1066`.
- **Current Status:** **Temporarily disabled** via `TEMP_DISABLED_ACTION_TYPES = new Set(['action_http_request'])` in `graph-executor.ts:33`. This check blocks execution before the edge function is invoked. However, the vulnerability is fully coded, no input sanitization was added, and re-enabling the feature immediately restores full SSRF capability.
- **Implication:** When the disable flag is removed, any authenticated workspace member with `automation:write` can force the Supabase Edge Function runtime to make arbitrary HTTP requests to internal services, cloud metadata endpoints (e.g., `http://169.254.169.254/`), or any host/port reachable from the Supabase network.
- **Representative Finding:** SSRF-VULN-01 (documented but excluded from queue due to disabled state).

### Pattern 2: Meta Graph API Path Traversal (API_Proxy_Bypass)

- **Description:** Five authenticated endpoints construct outbound `fetch()` calls to the Meta Graph API using user-supplied parameters (`platform_post_id`, `postId`, `commentId`) directly interpolated into URL template strings with no format validation. The base URL is fixed (`https://graph.facebook.com/v21.0/`), but the path segment is fully attacker-controlled. Using path traversal sequences (e.g., `../../../me/accounts`), an attacker can force the application server to make authenticated Meta Graph API calls to arbitrary endpoints, leveraging the stored access token of the connected social account.
- **Implication:** Attackers can access unauthorized Meta Graph API endpoints, exfiltrate account data (pages, leads, ad accounts), and perform state-modifying API calls—all authenticated with the victim's access token. This represents a full API proxy bypass.
- **Representative Findings:** SSRF-VULN-02, SSRF-VULN-03, SSRF-VULN-04, SSRF-VULN-05, SSRF-VULN-06.

### Pattern 3: Blind SSRF via Meta as Proxy (File_Fetch_Abuse)

- **Description:** The `POST /api/posts` endpoint accepts `mediaUrls[]` arrays. These are nominally validated via `sanitizeHttpUrl()` in `lib/security/phase1-validation.ts:65-77`. However, a critical bypass exists at line 352: if `sanitizeHttpUrl()` returns null, the fallback accepts any string beginning with `data:` up to 8 MB with no further validation. Beyond the bypass, legitimate `http://` and `https://` URLs pass validation but are stored verbatim and later supplied to Meta Graph API endpoints (`/{pageId}/photos`, `/{igAccountId}/media`, `/{pageId}/videos`) as the `url`/`image_url`/`video_url`/`file_url` parameter. Meta's servers then fetch the attacker-specified URL on demand—constituting blind SSRF with Meta as the egress proxy.
- **Implication:** Attackers can cause Meta's server infrastructure to fetch arbitrary URLs, potentially reaching services that allowlist Meta's IP ranges. While the application server itself is not the direct requester, the attack leverages the application as the orchestrator.
- **Representative Finding:** SSRF-VULN-07.

---

## 3. Strategic Intelligence for Exploitation

- **HTTP Client Libraries:**
  - Next.js API routes: Native `fetch()` (Node.js 18+ built-in)
  - Supabase Edge Functions: Deno's `fetch()` built-in
  - Meta Graph API calls: Native `fetch()` in both environments
- **Request Architecture:** The application follows a stored-SSRF pattern for automation workflows: user input is accepted via REST API → stored in PostgreSQL `automations` table → retrieved and executed by Supabase Edge Functions on trigger events (webhook comments, DMs, cron scheduler). For Meta Graph API calls, the application acts as a direct proxy using stored social account access tokens.
- **Authentication Landscape:** All exploitable Meta Graph API injection findings require a valid Supabase session with appropriate workspace role (`automation:write` for automations, `content:write` for posts/comments). The application does not implement IP-based access controls or additional proof-of-work; a legitimate registered account is sufficient.
- **Meta Access Tokens:** Tokens are stored encrypted in the database and decrypted at request time via `decryptToken()`. The encrypted tokens are tied to individual social accounts. An attacker using these injection vulnerabilities inherits the token's permissions on Meta's API.
- **Key Internal Service Discovery (for SSRF-VULN-01 when re-enabled):**
  - Supabase PostgreSQL: reachable at internal network address
  - Supabase REST API: reachable at `http://localhost:5432` or similar
  - AWS/GCP/Supabase Cloud Metadata: `http://169.254.169.254/latest/meta-data/` (AWS IMDS)
  - Supabase Studio: typically `http://localhost:3000` or similar internal port
- **`sanitizeHttpUrl()` Scope Gap:** The function at `lib/security/phase1-validation.ts:65-77` restricts protocols to `http:`/`https:` and uses `new URL()` for parsing. It is applied to `mediaUrls`, `brandProfileUrl`, and `referenceImageUrl` fields. **It is never applied to automation `workflow_graph` node `config.url` values**, leaving the automation HTTP worker completely unguarded.
- **TEMP_DISABLED_ACTION_TYPES:** Located in `supabase/functions/process-automations/graph-executor.ts:33`. This is a runtime software flag, not a configuration or environment variable—it can be toggled with a single-line code change or deployment.

---

## 4. Detailed Vulnerability Analysis

### SSRF-VULN-01: Automation Worker Unrestricted fetch() [DISABLED]

**Source Endpoint:** `POST /api/automations`, `PUT /api/automations/{id}`
**Vulnerable Parameter:** `workflow_graph.nodes[].data.config.url` (and `.method`, `.headers`, `.body`)
**Primary Sink:** `supabase/functions/automation-worker-http-request/index.ts:29`
**Secondary Sink:** `supabase/functions/process-automations/graph-executor.ts:1066`

**Data Flow:**
```
POST /api/automations
  body.workflow_graph.nodes[].data.config.url (user input)
    → app/api/automations/route.ts: NO URL validation on HTTP node configs
    → supabase.from('automations').insert({ workflow_graph: body.workflow_graph })
    → (on trigger) automation-orchestrator invokes automation-worker-http-request
    → config = body?.config || {}
    → fetch(String(config.url || ''), options)   ← SINK: index.ts:29
```

**Vulnerable Code:**
```typescript
// supabase/functions/automation-worker-http-request/index.ts
const response = await fetch(String(config.url || ''), options);  // LINE 29
```

**Disable Guard (blocks execution currently):**
```typescript
// supabase/functions/process-automations/graph-executor.ts:33-34
const TEMP_DISABLED_ACTION_TYPES = new Set([
  'action_http_request',
]);
```

**Missing Defenses:** No URL scheme validation, no private IP range checks, no domain/port allowlist, no DNS validation. `sanitizeHttpUrl()` exists in the codebase but is never applied to HTTP node URLs.

**Externally Exploitable:** No (disabled at runtime). Will become Critical when re-enabled.

---

### SSRF-VULN-02: platform_post_id Meta Graph API Path Injection

**Source Endpoint:** `POST /api/automations`
**Vulnerable Parameter:** `platform_post_id` (request body)
**Sink:** `app/api/automations/route.ts:242`

**Vulnerable Code:**
```typescript
// app/api/automations/route.ts:240-243
const testUrl = `${META_GRAPH_API_BASE_URL}/${platform_post_id}/comments?fields=id&limit=1&access_token=${account!.access_token}`;
const testResponse = await fetch(testUrl);
```

**Data Flow:**
```
POST /api/automations
  body.platform_post_id (user input, no format validation)
    → string interpolated into: https://graph.facebook.com/v21.0/{platform_post_id}/comments?...
    → fetch(testUrl)  ← SINK: route.ts:242
```

**Missing Defense:** No numeric/alphanumeric validation on `platform_post_id`. Path traversal sequences (`../`) are not blocked, allowing access to arbitrary Meta Graph API paths.

---

### SSRF-VULN-03 through SSRF-VULN-06: postId/commentId Meta Graph API Path Injection

Multiple handlers in `app/api/posts-media/comments/route.ts` follow the same pattern:

| ID | Handler | Line | Parameter | URL Template |
|---|---|---|---|---|
| SSRF-VULN-03 | GET | 115, 145 | `postId` (query param) | `https://graph.facebook.com/v21.0/{postId}/comments?...` |
| SSRF-VULN-04 | POST | 247 | `commentId` (body) | `https://graph.facebook.com/v21.0/{commentId}/replies` |
| SSRF-VULN-05 | DELETE | 335 | `commentId` (query param) | `https://graph.facebook.com/v21.0/{commentId}?is_hidden=true&...` |
| SSRF-VULN-06 | PATCH | 410 | `commentId` (body) | `https://graph.facebook.com/v21.0/{commentId}?hide=true/false&...` |

**Shared Vulnerability Pattern:** All four perform only existence checks (not null/empty) before interpolation. No format validation (numeric ID check, regex), no path traversal filter.

**Example Attack:**
```
GET /api/posts-media/comments?postId=../../../me/accounts&platform=instagram&accountId={valid_account_id}
→ Server fetches: https://graph.facebook.com/v21.0/../../../me/accounts/comments?...
→ URL normalized by fetch: https://graph.facebook.com/me/accounts/comments?...
→ Returns Meta account data authenticated with stored access token
```

---

### SSRF-VULN-07: mediaUrls Blind SSRF via Meta Publishing

**Source Endpoint:** `POST /api/posts`, `PUT /api/posts/{id}`
**Vulnerable Parameter:** `mediaUrls[]` (request body array)
**Sink:** `utils/meta-publish.ts` (multiple functions, lines 136, 188, 281, 397, 505, 562)

**Sanitization Present (but insufficient):**
```typescript
// lib/security/phase1-validation.ts:351-354
const mediaUrls = (Array.isArray(body.mediaUrls) ? body.mediaUrls : [])
    .map((value) => sanitizeHttpUrl(value) || (
        typeof value === 'string' && value.startsWith('data:') ? value.slice(0, 8_000_000) : null
    ))
    .filter((value): value is string => Boolean(value))
    .slice(0, 10)
```

**`sanitizeHttpUrl()` restricts to http:/https: but does NOT block:**
- Private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
- Internal hostnames
- Non-standard ports

**Blind SSRF Flow:**
```
POST /api/posts
  body.mediaUrls[0] = "http://169.254.169.254/latest/meta-data/"
    → sanitizeHttpUrl() accepts (valid http: URL)
    → stored in posts.media_urls
    → (on publish) process-scheduled-posts Edge Function retrieves URL
    → publishToInstagram()/publishToFacebookPhoto() called with imageUrl
    → Meta Graph API POST with body: { image_url: "http://169.254.169.254/..." }
    → Meta's servers attempt to fetch the URL  ← BLIND SSRF via Meta
```

**Missing Defense:** `sanitizeHttpUrl()` validates protocol but applies no IP range filtering or hostname allowlist. Meta's servers become the egress proxy.

---

### Additional Finding: apiKey HTTP Header Injection [NOT SSRF]

**Endpoint:** `POST /api/ai/validate-key` (unauthenticated)
**Vulnerable Parameter:** `apiKey` (request body)
**Sink:** `app/api/ai/validate-key/route.ts:26-28`

**Vulnerable Code:**
```typescript
const res = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${trimmedKey}` },
})
```

**Analysis:** The `apiKey` is trimmed but not sanitized for CRLF characters. If the underlying HTTP client does not strip newlines, an attacker could inject arbitrary headers. However: (1) the destination URL is fixed (not user-controlled), eliminating classic SSRF; (2) modern Node.js `fetch()` rejects headers containing `\r\n`, mitigating CRLF injection in practice. **Verdict: Not a viable SSRF vector; classified as low-severity header injection.**

---

## 5. Secure by Design: Validated Components

These components were analyzed and found to have defenses (partial or complete). They are noted here for completeness.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| `sanitizeHttpUrl()` protocol check | `lib/security/phase1-validation.ts:65-77` | Validates only `http:`/`https:` protocols via URL constructor; rejects `file://`, `gopher://`, `dict://`, `ftp://` | SAFE for scheme restriction; **UNSAFE for IP range / internal service access** |
| Automation HTTP worker execution guard | `supabase/functions/process-automations/graph-executor.ts:33-34` | `TEMP_DISABLED_ACTION_TYPES` set blocks `action_http_request` node execution | SAFE (runtime disabled); **code remains vulnerable** |
| `apiKey` CRLF header injection | `app/api/ai/validate-key/route.ts:26-28` | Node.js built-in `fetch()` rejects CRLF in header values; destination URL is fixed | SAFE (destination fixed; modern fetch strips CRLF) |
| Meta OAuth session tokens | `app/api/auth/meta/page-session` | 128-bit UUID entropy; 10-minute TTL | SAFE against brute-force |
| Webhook signature verification | `app/api/webhooks/instagram` | HMAC-SHA256 signature check before processing | SAFE against unsigned webhook injection |
