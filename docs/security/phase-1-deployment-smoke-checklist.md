# Phase 1 Deployment Security Smoke Checklist

Date: 2026-05-18
Status: ready for deploy validation

This checklist covers Phase 1 checks that cannot be fully proven by local unit tests because they depend on the deployed Vercel project, the live connector clients, and production logs.

## Vercel Access Status

Local project link:

- Project ID: `prj_04P7uAn9Rbw6mS8UF16eKiTFAlSt`
- Team ID: `team_O8kC0q2iSmQ4Ss7Mj9o5oDjW`
- Project name: `social-media-manager-ai`

Codex attempted to read the linked Vercel project through the Vercel MCP on 2026-05-18 and received `403 Forbidden`. Dashboard/API verification must be performed by a Vercel user with project security access.

## Security Header Smoke

Run against production after deployment:

```powershell
$url = "https://social.swiftdigital-s.com/dashboard"
$headers = (Invoke-WebRequest -Uri $url -Method Head).Headers
$headers["X-Frame-Options"]
$headers["X-Content-Type-Options"]
$headers["Referrer-Policy"]
$headers["Permissions-Policy"]
$headers["Strict-Transport-Security"]
$headers["Content-Security-Policy-Report-Only"]
```

Expected:

- `X-Frame-Options`: `DENY`
- `X-Content-Type-Options`: `nosniff`
- `Referrer-Policy`: `strict-origin-when-cross-origin`
- `Strict-Transport-Security`: present on production HTTPS
- `Content-Security-Policy-Report-Only`: present and includes `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, and `connect-src 'self' https: wss:`

Keep CSP report-only until the asset/connect inventory is stable. Move to enforced CSP only after reviewing production CSP reports for blocked Supabase, Meta, image, font, analytics, and generated-media origins.

## Vercel Firewall / WAF

Dashboard verification:

1. Open Vercel project `social-media-manager-ai`.
2. Confirm Firewall/WAF is enabled for production.
3. Confirm managed protections remain enabled for common malicious traffic.
4. Add or verify custom deny/rate-limit rules for obvious abuse against:
   - `/api/developer/*`
   - `/api/assistant/command`
   - `/api/auth/meta/*`
   - `/api/webhooks/instagram`
5. If using Vercel CLI, stage and publish rules only after reviewing `vercel firewall diff`.

Suggested launch rule intent:

- Rate-limit repeated unauthenticated requests to `/api/developer/*`.
- Rate-limit repeated POSTs to `/api/assistant/command`.
- Deny obvious scanner payloads and suspicious headers only after confirming no false positives in preview.
- Do not block Meta webhook requests by user-agent alone.

## Deployment Protection

Dashboard verification:

1. Confirm preview deployments require Vercel Authentication or an automation bypass secret.
2. Confirm production remains public for the main app domain.
3. Confirm any preview smoke script uses `x-vercel-protection-bypass` only from a secret environment variable.
4. Confirm no bypass secret is committed or exposed to client-side code.

## Revoked / Expired Developer API Key Smoke

Run after deployment with a short-lived test key:

1. Create a Developer API key in Settings with at least `workspace:read`.
2. Confirm it works:

```powershell
$base = "https://social.swiftdigital-s.com"
$token = "sf_live_REPLACE_WITH_TEST_KEY"
Invoke-RestMethod "$base/api/developer/v1/workspace" -Headers @{ Authorization = "Bearer $token" }
```

3. Revoke the key in Settings.
4. Retry the same request.

Expected response:

- HTTP `401`
- JSON code is `inactive_key`
- No workspace data is returned

5. If testing through ChatGPT, Claude, or Codex connectors, call a simple tool such as workspace read or scheduled-post listing after revocation.

Expected connector behavior:

- Tool call fails with an auth error.
- Connector may ask to reconnect.
- It must not continue using stale OAuth/session credentials after the backing Developer API key is revoked.

## Production Log Sampling

After the first deploy and smoke run, sample Vercel and Supabase logs for these forbidden raw values:

- `sf_live_`
- `sf_oauth_access.`
- `sf_oauth_refresh.`
- `access_token=`
- `refresh_token=`
- `client_secret=`
- `Authorization: Bearer`
- `SUPABASE_SERVICE_ROLE_KEY`
- raw Meta Page or Instagram tokens
- raw OpenAI/OpenRouter/Gemini API keys

Expected:

- Sensitive values are absent or replaced with `[REDACTED]`.
- AI generation logs show lengths/status, not full generated replies, prompts, or provider payloads.
