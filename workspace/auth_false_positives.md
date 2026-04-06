# Auth Exploitation False Positives

## AUTH-VULN-02: Password Policy Enforced Client-Side Only

**Classification: FALSE POSITIVE**

**What was attempted:**
- Called `POST https://txomrdymcawauezlprvn.supabase.co/auth/v1/signup` directly with anon key
- Tested passwords: "abc", "123", "a", "password" (all below 10 chars with no complexity)
- Tested multiple email addresses to confirm consistent behavior

**Why it's a false positive:**
The Supabase project has been configured to enforce the SAME password policy as the application's client-side validation. All attempts to register with weak passwords returned:
```json
{
  "code": 422,
  "error_code": "weak_password",
  "msg": "Password should be at least 10 characters. Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$%^&*()_+-=[]{};':\"|\u003c\u003e?,./`~.",
  "weak_password": {"reasons": ["length", "characters"]}
}
```
The application's Supabase project has been configured with a custom password strength policy that matches or exceeds the UI validation. While the analysis assumed Supabase defaults to 6-char minimum, this project has custom password security settings enabled in the Supabase dashboard.

---

## AUTH-VULN-03: Authentication Bypass via Fail-Open Middleware

**Classification: FALSE POSITIVE**

**What was attempted:**
- Sent malformed `sb-txomrdymcawauezlprvn-auth-token` cookie with oversized garbage (~2KB of "A"s)
- Sent cookie with invalid base64 characters (`!!!INVALID!!!BASE64!!!`)
- Sent cookie with valid JSON but corrupted JWT structure (`{"access_token":"BADTOKEN.INVALID.SIGNATURE"}`)
- Sent cookie with URL-encoded corrupt JSON
- Sent chunked cookie format with invalid chunks (`.0` and `.1` suffix variants)
- Sent null bytes in cookie values

**Why it's a false positive:**
The Supabase `@supabase/ssr` library (v0.8.0) handles ALL cookie parsing errors internally without propagating exceptions to the caller. When `supabase.auth.getUser()` encounters invalid cookie data, it returns `{data: {user: null}, error: ...}` rather than throwing. This means the catch block in `proxy.ts` (lines 92-97) is effectively unreachable via cookie manipulation. All 6 malformed cookie attack patterns returned HTTP 307 redirect to `/login` - the expected authenticated-required behavior.

The catch block is still poor coding practice (fail-open is dangerous), but the specific path to trigger it via HTTP cookies does not exist in the current Supabase SSR implementation.
