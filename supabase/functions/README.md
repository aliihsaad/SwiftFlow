# Supabase Edge Functions Map

This folder contains all deployed Supabase edge functions used by the app.

## AI / Assistant
- `chat-assistant`
- `generate-caption`
- `generate-carousel`
- `generate-ideas`
- `generate-image`
- `generate-message-reply`
- `generate-reply`

## Publishing / Analytics / Sync
- `process-scheduled-posts`
- `process-publishing-automations`
- `sync-analytics`
- `sync-comments`
- `sync-messages`
- `scheduler-tick` (Supabase cron target that runs scheduled posts + delay resumes + publishing automations)

## Automation (Wizard + Canvas)
- `process-automations`:
  - Handles wizard/simple automations.
  - Also hosts shared graph executor utilities used by canvas workers.
- `process-scheduled-executions`:
  - Resumes delayed canvas nodes.
- `automation-orchestrator`:
  - Receives trigger payloads and creates automation runs.
- `automation-worker-run`:
  - Traverses workflow graph and executes nodes.
- `automation-worker-ai-response`
- `automation-worker-condition`
- `automation-worker-http-request`
- `automation-worker-private-reply`
- `automation-worker-reply-comment`
- `automation-worker-send-dm`
- `automation-worker-send-email`

## Shared Helpers
- `_shared/`

## Notes
- Removed/deprecated functions were deleted from this repo and should not be redeployed.
- Keep function names stable once referenced by app routes or webhook handlers.
- Vercel Hobby does not support 1-minute cron. Use a Supabase schedule targeting `scheduler-tick` for minutely jobs.

## Deployment Requirement (Internal Invocations)

Functions invoked internally by the app server, schedulers, or other edge functions must be deployed with `--no-verify-jwt` when they are not called with a user JWT at the function gateway.

Reason:
- `automation-orchestrator` and `process-scheduled-executions` invoke worker functions internally.
- `process-scheduled-posts` is invoked by the app server for "publish now" and by `scheduler-tick`.
- `process-publishing-automations` is invoked by `scheduler-tick`.
- In the current setup, redeploying workers without `--no-verify-jwt` can cause internal dispatch failures (`401 Invalid JWT`) before the worker executes.
- `process-scheduled-posts` now performs its own internal auth check by requiring the caller `apikey` header to match `SUPABASE_SERVICE_ROLE_KEY`, so it can stay non-public even when deployed without gateway JWT verification.
- Typical symptom in logs: webhook trigger matches automation, but orchestrator reports `matched > 0`, `dispatched: 0`, `failed > 0`.
- Typical symptom for publishing: a "publish now" post remains in `scheduled`, while `process-scheduled-posts` logs `401` at the function gateway.

Functions that require `--no-verify-jwt`:
- `process-scheduled-posts`
- `process-publishing-automations`
- `automation-worker-run`
- `automation-worker-ai-response`
- `automation-worker-condition`
- `automation-worker-http-request`
- `automation-worker-private-reply`
- `automation-worker-reply-comment`
- `automation-worker-send-dm`
- `automation-worker-send-email`

Recommended deploy commands:

```bash
supabase functions deploy process-scheduled-posts --no-verify-jwt
supabase functions deploy process-publishing-automations --no-verify-jwt
supabase functions deploy automation-worker-run --no-verify-jwt
supabase functions deploy automation-worker-ai-response --no-verify-jwt
supabase functions deploy automation-worker-condition --no-verify-jwt
supabase functions deploy automation-worker-http-request --no-verify-jwt
supabase functions deploy automation-worker-private-reply --no-verify-jwt
supabase functions deploy automation-worker-reply-comment --no-verify-jwt
supabase functions deploy automation-worker-send-dm --no-verify-jwt
supabase functions deploy automation-worker-send-email --no-verify-jwt
```

Cron target / orchestration entrypoints (normal deploy):

```bash
supabase functions deploy scheduler-tick
supabase functions deploy automation-orchestrator
supabase functions deploy process-scheduled-executions
supabase functions deploy process-automations
```

## Supabase Cron Setup (Recommended for 1-minute Jobs)

Use a single Supabase schedule to invoke `scheduler-tick` every minute. The function runs:
- `process-scheduled-posts`
- `process-scheduled-executions` (Delay node resumes)
- `process-publishing-automations` (AI publishing automation draft generation)

Recommended schedule:
- `* * * * *`

This avoids running separate minutely schedulers and keeps the cadence at 1440 ticks/day total.
