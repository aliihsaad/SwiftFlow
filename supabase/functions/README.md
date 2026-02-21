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
