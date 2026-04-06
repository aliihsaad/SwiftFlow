# Instagram Webhooks Migration Plan (Shared Meta App)

## Goal
Move from polling-based comments/messages to webhook-driven updates, using one shared Meta app for all workspaces.

## Why this plan
- Reduces delay for automations (event-driven instead of cron checks).
- Reduces unnecessary Graph API reads.
- Keeps workspace isolation in app/database while simplifying Meta app operations.

## Current state in this repo
- Message UI currently fetches live from Meta and refreshes periodically.
- Automation engine currently polls comments and deduplicates with `processed_comments`.
- OAuth currently supports per-workspace Meta credentials.

## Target architecture
1. One Meta app for all workspaces.
2. One webhook endpoint: `POST/GET /api/webhooks/instagram`.
3. Webhook events are signature-verified, then mapped to the correct workspace/account.
4. Comment events trigger automation immediately.
5. Message events trigger realtime client refresh (event notification + SWR mutate).
6. Keep idempotency in DB for webhook events.

---

## File-level implementation plan

### 1) OAuth: switch to shared Meta app credentials
Update login/callback to use env credentials only.

- `app/api/auth/meta/login/route.ts`
  - Remove workspace settings lookup for `meta_app_id/meta_app_secret`.
  - Build OAuth URL from `NEXT_PUBLIC_META_APP_ID`.
  - Keep `state=workspaceId`.

- `app/api/auth/meta/callback/route.ts`
  - Remove workspace settings lookup for app credentials.
  - Exchange code using `NEXT_PUBLIC_META_APP_ID` and `META_APP_SECRET`.
  - Keep existing page selection/session flow.

- `utils/meta-oauth.ts`
  - Keep env-based helpers as primary path.
  - Keep scope list unchanged unless Meta policy requires updates.

### 2) UI: remove per-workspace Meta app requirement
- `components/settings/connected-accounts.tsx`
  - Remove `metaAppConfigured` gating and related error UI.
  - Keep "Connect Facebook Pages" action.

- `components/settings/meta-app-config.tsx`
  - Remove from settings flow (or mark deprecated/internal).

- `app/api/workspace/settings/route.ts` and `types/settings.ts`
  - Stop depending on `meta_app_id/meta_app_secret` for connection flow.
  - DB columns can remain temporarily to avoid risky migration in same release.

### 3) Add webhook route
Create:
- `app/api/webhooks/instagram/route.ts`

Implement:
- `GET`: Meta verification handshake (`hub.mode`, `hub.verify_token`, `hub.challenge`).
- `POST`: raw body read, HMAC SHA-256 validation via `X-Hub-Signature-256` and `META_APP_SECRET`.
- Return `401` on signature mismatch.
- Return fast `200` after enqueue/trigger logic.

### 4) Workspace/account resolution from event payload
Use IDs in webhook payload to find owning workspace and social account.

Lookup strategy:
1. Match `social_accounts.account_id` (IG business account ID).
2. Fallback to `social_accounts.metadata.connected_page_id` (for page-scoped messaging events).

### 5) Comment automation: event-driven path
- Extend processing logic in `supabase/functions/process-automations/index.ts`:
  - Add handler for direct webhook comment payload (post/comment/user IDs).
  - Keep existing dedupe and logs:
    - `processed_comments`
    - `automation_logs`

- Webhook route should call targeted automation processing:
  - by `workspace_id`
  - by `platform_post_id`
  - with the incoming comment context

### 6) Message UI refresh: event-triggered
- `app/dashboard/messages/page.tsx`
  - Add realtime subscription channel (workspace-scoped).
  - On new message event, call existing `mutateConversations()` and `mutateMessages()`.
  - Keep current polling interval during rollout; remove after stability.

### 7) Idempotency table for webhook events
Add migration:
- `supabase/migrations/<timestamp>_add_webhook_events.sql`

Table suggestion:
- `webhook_events`
  - `id` UUID PK
  - `event_key` TEXT UNIQUE
  - `workspace_id` UUID
  - `event_type` TEXT
  - `received_at` TIMESTAMPTZ default now()

Use `event_key` derived from stable identifiers (e.g., object + entry id + change id + timestamp).

### 8) Environment variables
Ensure:
- `NEXT_PUBLIC_META_APP_ID`
- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `NEXT_PUBLIC_APP_URL`
- `SUPABASE_SERVICE_KEY`

Update `env.example` to include `META_WEBHOOK_VERIFY_TOKEN`.

---

## Meta App dashboard configuration

## 1) Products
In your Meta app, add/configure:
- Facebook Login for Business
- Webhooks

## 2) OAuth redirect URIs
Configure in Facebook Login settings:
- Local: `http://localhost:3000/api/auth/meta/callback`
- Production: `https://<your-domain>/api/auth/meta/callback`
- If testing through tunnel domain for full browser flow:
  - `https://<your-ngrok-subdomain>.ngrok-free.app/api/auth/meta/callback`

Important:
- The redirect URI must exactly match what your app sends.
- Your app currently builds it from `NEXT_PUBLIC_APP_URL + /api/auth/meta/callback`.

## 3) Webhooks setup
In Webhooks settings (Instagram object):
- Callback URL:
  - Production: `https://<your-domain>/api/webhooks/instagram`
  - Local via tunnel: `https://<your-ngrok-subdomain>.ngrok-free.app/api/webhooks/instagram`
- Verify Token:
  - Use the same value as `META_WEBHOOK_VERIFY_TOKEN`.
- Subscribe fields (minimum for this migration):
  - `comments`
  - `messages`
- Optional:
  - `mentions`

## 4) App mode
- Development mode: events only for app-role users (Admin/Developer/Tester).
- Live mode: required for public users/customers after app review.

---

## Webhook verification details

## A) Verify token (GET, setup-time)
Meta sends:
- `hub.mode=subscribe`
- `hub.verify_token=<token>`
- `hub.challenge=<string>`

Server logic:
1. Compare incoming `hub.verify_token` to `META_WEBHOOK_VERIFY_TOKEN`.
2. If match, return `hub.challenge` (200).
3. Else return 403.

## B) Signature verification (POST, every event)
Meta sends header:
- `X-Hub-Signature-256: sha256=<hex_digest>`

Server logic:
1. Read raw request body as text.
2. Compute `HMAC_SHA256(rawBody, META_APP_SECRET)`.
3. Compare with header digest.
4. Process only if valid; otherwise return 401.

Notes:
- Use constant-time comparison to avoid timing leaks.
- Validate before parsing JSON.

---

## Runtime process flow
1. User comments or sends DM on Instagram.
2. Meta posts event to `/api/webhooks/instagram`.
3. Server validates signature.
4. Server resolves workspace/account from event IDs.
5. For comments:
   - check idempotency
   - trigger targeted automation
   - write logs/dedupe
6. For messages:
   - emit workspace-scoped realtime event
   - client receives event and calls SWR mutate
7. UI updates without polling dependency.

---

## Rollout plan
1. Implement webhook endpoint + idempotency + event logging.
2. Enable comment automation trigger from webhook while keeping existing cron fallback.
3. Enable message realtime-triggered refresh while keeping polling fallback.
4. Monitor for duplicate events/missed events.
5. Remove polling intervals and cron dependency when stable.

## Acceptance checks
- Webhook GET verification passes in Meta dashboard.
- Invalid POST signature returns 401.
- Valid comment event triggers exactly one automation run.
- Valid message event refreshes conversation/thread quickly.
- No duplicate DM/comment-reply caused by retries.

---

## Open decisions
- Whether to fully remove legacy per-workspace Meta credential UI now or later.
- Whether to keep `sync-comments`/`sync-messages` as emergency backfill jobs only.
- Final retention policy for `webhook_events` table (cleanup job recommended).
