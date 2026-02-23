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
- `search-unsplash`
- `select-unsplash-image`

## Publishing / Analytics / Sync
- `process-scheduled-posts`
- `sync-analytics`
- `sync-comments`
- `sync-messages`

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

## Deployment Requirement (Automation Workers)

Canvas automation worker functions must be deployed with `--no-verify-jwt`.

Reason:
- `automation-orchestrator` and `process-scheduled-executions` invoke worker functions internally.
- In the current setup, redeploying workers without `--no-verify-jwt` can cause internal dispatch failures (`401 Invalid JWT`) before the worker executes.
- Typical symptom in logs: webhook trigger matches automation, but orchestrator reports `matched > 0`, `dispatched: 0`, `failed > 0`.

Functions that require `--no-verify-jwt`:
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
supabase functions deploy automation-worker-run --no-verify-jwt
supabase functions deploy automation-worker-ai-response --no-verify-jwt
supabase functions deploy automation-worker-condition --no-verify-jwt
supabase functions deploy automation-worker-http-request --no-verify-jwt
supabase functions deploy automation-worker-private-reply --no-verify-jwt
supabase functions deploy automation-worker-reply-comment --no-verify-jwt
supabase functions deploy automation-worker-send-dm --no-verify-jwt
supabase functions deploy automation-worker-send-email --no-verify-jwt
```

Orchestrator/scheduler functions (normal deploy):

```bash
supabase functions deploy automation-orchestrator
supabase functions deploy process-scheduled-executions
supabase functions deploy process-automations
```
