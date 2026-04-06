# Authentication Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** Multiple authentication flaws were identified, primarily related to absent rate limiting / abuse defenses, client-side-only password policy enforcement, a middleware fail-open authentication bypass, and raw error message exposure enabling user enumeration. The application's session management (cookie flags, session rotation via Supabase PKCE) and OAuth state handling are well-implemented. Critical exploitable attack paths exist for brute force, credential stuffing, and weak-credential account registration.
- **Purpose of this Document:** This report provides the strategic context on the application's authentication mechanisms, dominant flaw patterns, and key architectural details necessary to effectively exploit the vulnerabilities listed in the exploitation queue.

### Application Authentication Architecture

The SwiftFlow Social Media Manager uses **Supabase Auth** (GoTrue) as its identity provider. Authentication is email/password only for primary user accounts; Meta OAuth is used exclusively to *connect* social media accounts (not for user login). Session tokens are Supabase JWTs stored in HTTP-only cookies managed by the `@supabase/ssr` v0.8.0 library. A custom Next.js middleware (`proxy.ts`) enforces route-level authentication by calling `supabase.auth.getUser()` on every request to `/dashboard/*`.

---

## 2. Dominant Vulnerability Patterns


### Pattern 1: Total Absence of Abuse Defenses on Authentication Endpoints

- **Description:** No rate limiting, CAPTCHA, account lockout, or progressive delay mechanism exists anywhere in the application. This applies to login, signup, and all auth-adjacent endpoints. No rate-limiting package (`upstash`, `express-rate-limit`, `redis`, etc.) appears in `package.json`, and no custom throttling middleware was found. The application relies entirely on whatever Supabase's hosted service imposes at the network edge—which is not configurable at the application layer and cannot be verified.
- **Implication:** Attackers can make unlimited authentication attempts from a single IP with no throttling. Both credential brute-forcing (targeting known accounts) and credential stuffing (replaying breached credential lists) are fully viable.
- **Representative Findings:** `AUTH-VULN-01`.

### Pattern 2: Client-Side-Only Security Controls

- **Description:** The application's password complexity policy (≥10 characters, lowercase, uppercase, digit, symbol) is implemented exclusively in client-side JavaScript (`app/login/page.tsx`, `validatePasswordAgainstPolicy()`). There is no corresponding server-side enforcement route. Because `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are embedded in the public client bundle (by design for Supabase), any attacker can call Supabase's Auth REST API (`POST /auth/v1/signup`) directly, bypassing the application's JS validation entirely. Supabase's own default minimum is typically 6 characters.
- **Implication:** Accounts can be registered with passwords as short as 6 characters (or whatever Supabase's project minimum is), which are trivially brute-forced or dictionary-attacked.
- **Representative Finding:** `AUTH-VULN-02`.

### Pattern 3: Fail-Open Middleware Authentication

- **Description:** The Next.js middleware (`proxy.ts`) wraps the entire auth-check-and-route-protection logic in a single `try/catch`. The catch block at lines 92–97 logs the error and returns the original `response` object, which allows the request to proceed rather than redirecting to `/login`. If an attacker can cause `supabase.auth.getUser()` to throw—for example, by submitting a malformed or oversized cookie that triggers a parsing exception—the middleware silently permits access to every `/dashboard/*` route without authentication.
- **Implication:** A carefully crafted malformed session cookie may bypass the authentication gate on all dashboard routes.
- **Representative Finding:** `AUTH-VULN-03`.

### Pattern 4: Raw Error Message Pass-Through (User Enumeration)

- **Description:** The login page's `getErrorMessage()` helper (line 40-43, `app/login/page.tsx`) returns `error.message` directly from the caught exception without sanitization. Both `handleSignIn` and `handleSignUp` feed the Supabase error object directly to this helper and display the result to the user. Supabase GoTrue is known to return distinct messages in some configurations ("Invalid login credentials" vs. "Email not confirmed", and "User already registered" on duplicate signup), enabling email/account enumeration.
- **Implication:** Attackers can enumerate valid registered email addresses by observing differing signup error responses.
- **Representative Finding:** `AUTH-VULN-04`.

---

## 3. Strategic Intelligence for Exploitation

- **Authentication Method:** Email/password via Supabase Auth (GoTrue). No SSO or social login for primary user accounts.
- **Session Token Details:** After email confirmation, a PKCE code exchange occurs at `/auth/callback`. The resulting Supabase JWT (access token) and refresh token are stored in HTTP-only, SameSite=Lax cookies managed by `@supabase/ssr`. Cookie names follow Supabase's default scheme (`sb-<ref>-auth-token`). The `Secure` flag is set conditionally (`NODE_ENV === 'production'`), meaning the dev/staging instance at `http://host.docker.internal:3000` issues non-secure cookies over HTTP.
- **Middleware Guard:** `proxy.ts` protects all `/dashboard/*` routes. It calls `supabase.auth.getUser()` to validate the session on every request and redirects unauthenticated users to `/login`. Critically, the entire guard is wrapped in a try/catch that fails open (see Pattern 3 above).
- **Supabase Public Credentials:** The `NEXT_PUBLIC_SUPABASE_URL` (`https://txomrdymcawauezlprvn.supabase.co`) and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are embedded in the client JavaScript bundle. These are intended to be public and allow direct calls to Supabase's Auth REST API from any client.
- **Password Policy:** The application enforces ≥10 chars + lowercase + uppercase + digit + symbol—but only in client-side JavaScript. Supabase's own project minimum (typically 6 characters unless reconfigured in the Supabase dashboard) is the only server-enforced constraint.
- **Logout:** `app/actions/auth.ts` calls `supabase.auth.signOut()` as a server action, which properly invalidates the server-side session. Server-side logout is correctly implemented.
- **Password Reset:** No custom password reset flow exists in the application code. Password reset is delegated entirely to Supabase's hosted email flow. No application-level rate limiting or enumeration protection is applied to this flow.
- **Meta OAuth (Social Account Linking):** Used only for connecting Meta/Instagram pages to workspaces—not for user authentication. State parameter is a cryptographic UUID stored in an HTTP-only cookie, validated on callback with freshness and nonce checks. This flow is secure.
- **Invite Tokens:** 256-bit entropy (two concatenated UUIDs), 7-day TTL, single-use, require matching authenticated user email. This flow is secure.
- **No HSTS:** Neither `next.config.ts` nor `proxy.ts` sets `Strict-Transport-Security`. The live test application serves over HTTP, and no HSTS header was observed. Production deployment on Vercel may receive HSTS from Vercel's CDN layer, but it is not enforced by the application.

---

## 4. Detailed Vulnerability Findings

### AUTH-VULN-01: No Rate Limiting, CAPTCHA, or Lockout on Authentication Endpoints

**Type:** Abuse_Defenses_Missing
**Confidence:** High
**Endpoints:** `POST /login` (login action), `POST /login` (signup action), `/auth/callback` (code exchange)

**Source-to-Sink Trace:**
```
app/login/page.tsx:97 → supabase.auth.signInWithPassword({email, password})
  → Supabase Auth REST API: POST https://txomrdymcawauezlprvn.supabase.co/auth/v1/token
    → No rate limit middleware in proxy.ts
    → No rate limit in package.json dependencies
    → No IP-based or account-based throttle anywhere in codebase
```

**Missing Defense:** There is no rate-limiting middleware, no CAPTCHA trigger after failed attempts, no progressive delay, and no account lockout logic anywhere in the application. The `package.json` contains no rate-limiting library. The entire auth flow delegates directly to Supabase's GoTrue service, which has minimal default rate limits that are not configured or verified at the application layer.

**Affected Files:**
- `app/login/page.tsx` lines 96-110 (handleSignIn — unlimited calls to `supabase.auth.signInWithPassword`)
- `proxy.ts` lines 1-113 (no rate limiting applied)
- `package.json` (no `upstash`, `redis`, `express-rate-limit`, or equivalent dependency)

---

### AUTH-VULN-02: Password Policy Enforced Client-Side Only

**Type:** Abuse_Defenses_Missing
**Confidence:** High
**Endpoint:** Direct call to `POST https://txomrdymcawauezlprvn.supabase.co/auth/v1/signup`

**Source-to-Sink Trace:**
```
app/login/page.tsx:26-62 → validatePasswordAgainstPolicy() [CLIENT-SIDE ONLY]
  → If bypass (direct API call): Supabase.auth.v1/signup with any password
    → No server-side password validation route exists
    → Supabase project minimum (~6 chars) is the only actual enforcement
```

**Missing Defense:** The application defines a strong password policy (≥10 chars, mixed case, digit, symbol) but enforces it entirely in client-side JavaScript (`validatePasswordAgainstPolicy` in `app/login/page.tsx` lines 26-62). There is no server-side API route that re-validates the password before forwarding to Supabase. Because `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are intentionally embedded in the public JS bundle, an attacker can call `POST https://txomrdymcawauezlprvn.supabase.co/auth/v1/signup` directly with any password that satisfies only Supabase's own minimum (typically 6 characters).

**Affected Files:**
- `app/login/page.tsx` lines 26-62 (`validatePasswordAgainstPolicy` — client-side only)
- `app/login/page.tsx` lines 134-141 (calls `supabase.auth.signUp()` from client with no server intermediary)
- No server-side `/api/auth/signup` route exists to re-enforce the policy

---

### AUTH-VULN-03: Middleware Fail-Open — Authentication Bypass on Exception

**Type:** Authentication_Bypass
**Confidence:** Medium
**Endpoint:** Any `GET /dashboard/*` route

**Source-to-Sink Trace:**
```
proxy.ts:38-40 → supabase.auth.getUser() [may throw on malformed cookie]
  → proxy.ts:92-97 → catch(error) { return response; }  // FAIL-OPEN
    → Request proceeds to /dashboard/* without authentication check
      → Dashboard renders with unauthenticated access
```

**Missing Defense:** The entire authentication gate in `proxy.ts` is wrapped in a single `try/catch`. If `supabase.auth.getUser()` throws an exception (e.g., due to a malformed, oversized, or syntactically invalid session cookie that triggers a parsing error in the `@supabase/ssr` cookie handler), the catch block at lines 92–97 allows the request to proceed to the protected route instead of redirecting to `/login`. The catch block explicitly reads: `// On error, allow the request to proceed`.

**Affected File:**
- `proxy.ts` lines 38-40 (auth check), 92-97 (fail-open catch block)

---

### AUTH-VULN-04: User Enumeration via Raw Error Message Pass-Through

**Type:** Login_Flow_Logic
**Confidence:** Medium
**Endpoint:** `POST /login` (signup tab)

**Source-to-Sink Trace:**
```
app/login/page.tsx:134-141 → supabase.auth.signUp({email, password})
  → Supabase GoTrue returns AuthError with .message = "User already registered"
    → app/login/page.tsx:148-150 → catch(error) → getErrorMessage(error, "Sign up failed")
      → app/login/page.tsx:41 → returns error.message directly (no sanitization)
        → UI displays "User already registered" → email enumerated
```

**Missing Defense:** The `getErrorMessage()` helper at lines 40-43 of `app/login/page.tsx` returns `error.message` verbatim from any `Error` instance. Both `handleSignIn` and `handleSignUp` pass the raw Supabase `AuthError` object directly through this helper. Supabase GoTrue may return distinguishable error messages for existing vs. non-existing accounts (e.g., "User already registered" on duplicate signup), enabling systematic email enumeration. No message normalization, mapping, or sanitization layer exists between Supabase's response and the rendered UI.

**Affected File:**
- `app/login/page.tsx` lines 40-43 (`getErrorMessage`), 103-105 (login error display), 148-150 (signup error display)

---

### AUTH-VULN-05: No HSTS Header — Plaintext Session Cookie Exposure

**Type:** Transport_Exposure
**Confidence:** Low
**Scope:** All auth endpoints on `http://host.docker.internal:3000`

**Source-to-Sink Trace:**
```
next.config.ts → no headers() function defined
proxy.ts → no Strict-Transport-Security header set
Live probe: GET http://host.docker.internal:3000/ → no HSTS header in response
  → Session cookies transmitted over HTTP without Secure flag (NODE_ENV != 'production')
    → Susceptible to network interception / downgrade attacks
```

**Missing Defense:** No `Strict-Transport-Security` header is set anywhere in the application (`next.config.ts` has no `headers()` config; `proxy.ts` does not set it). The application serves at `http://host.docker.internal:3000` over plaintext HTTP. In this environment, `NODE_ENV !== 'production'`, so the `Secure` flag on all application cookies (`active_workspace_id`, Meta OAuth state) is `false`. Supabase SSR cookies also inherit `secure: false` in non-production mode. This means session credentials are transmitted in cleartext. Mitigated in a Vercel production deployment (Vercel enforces HTTPS at the CDN), but the test instance is HTTP.

**Affected Files:**
- `next.config.ts` (no `headers()` security configuration)
- `proxy.ts` lines 70-76 (`secure: process.env.NODE_ENV === 'production'` — false in current environment)

---

## 5. Secure by Design: Validated Components

These components were analyzed and found to have robust defenses. They are low-priority for further auth testing.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| Session Cookie HttpOnly Flag | `proxy.ts:70-76`, `utils/supabase/server.ts` | Supabase SSR sets `httpOnly: true` on all auth token cookies by default; application cookies also set `httpOnly: true` explicitly | SAFE |
| Session Cookie SameSite Flag | `proxy.ts:74`, `app/api/auth/meta/login/route.ts:63` | All cookies set `sameSite: 'lax'`, preventing cross-site request forgery on standard flows | SAFE |
| Supabase Auth Session Rotation | `app/auth/callback/route.ts:14` | PKCE `exchangeCodeForSession()` issues a fresh JWT/refresh-token pair on every login; the authorization code is single-use | SAFE |
| Server-Side Logout | `app/actions/auth.ts:6-8` | Calls `supabase.auth.signOut()` as a Next.js Server Action, invalidating the server-side session and clearing cookies | SAFE |
| Meta OAuth State Parameter | `app/api/auth/meta/login/route.ts:50-67`, `app/api/auth/meta/callback/route.ts:82-105` | Cryptographic UUID nonce stored in HTTP-only cookie; validated on callback for nonce match, workspace ID presence, and freshness (10-minute TTL) | SAFE |
| Meta OAuth Redirect URI | `utils/meta-oauth.ts:144-147` | Redirect URI is fixed from an environment variable, not user-supplied; cannot be manipulated via request parameters | SAFE |
| Meta OAuth Account Linking | `app/api/auth/meta/select-page/route.ts:68-73` | Linking requires an authenticated Supabase session (`supabase.auth.getUser()`) and workspace `integrations:write` permission; email matching not used, preventing nOAuth-style attacks | SAFE |
| Invite Token Entropy | `app/actions/team-members.ts:46-48` | Tokens generated from two concatenated `crypto.randomUUID()` calls = 256 bits of entropy; cryptographically unguessable | SAFE |
| Invite Token Single-Use | `app/actions/team-members.ts:395-421` | Token status checked (`pending`/`accepted`/`expired`); once accepted, re-use by a different user is rejected | SAFE |
| Invite Email Binding | `app/actions/team-members.ts:419-421` | Authenticated user's email must match the invite's target email (case-insensitive normalization) | SAFE |
| Invite Token TTL | `app/actions/team-members.ts:150` | 7-day expiry enforced at insert time; expired tokens are rejected | SAFE |
| OAuth Temp Session Storage | `app/api/auth/meta/callback/route.ts:281-295` | Meta access tokens encrypted with AES-256-GCM (`encryptMetaToken`), stored server-side with a 10-minute TTL | SAFE |
| Default Credentials | Entire codebase | No seed files, migration scripts, or hardcoded default admin/test accounts were found | SAFE |
| Cache-Control on Auth Pages | `GET /login`, `GET /` | Live probe confirmed `Cache-Control: no-store, must-revalidate` on all page responses | SAFE |
