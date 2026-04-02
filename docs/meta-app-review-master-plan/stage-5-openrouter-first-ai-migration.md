# Stage 5: OpenRouter-First AI Migration

Status: `not_started`

Depends on: `Stage 2`

## Goal

Replace the current Gemini/OpenAI split with a cleaner OpenRouter-first architecture.

## Core Decision

Do not add a separate "AI provider router" edge function.

Instead:

- create one shared OpenRouter adapter
- migrate AI functions to use that adapter directly
- gate capabilities where OpenRouter is not yet a clean replacement

## Required Work

1. Add `openrouter` as a first-class provider in schema, settings UI, and runtime config
2. Create one shared adapter, for example:
   - `supabase/functions/_shared/openrouter-client.ts`
3. Migrate these text flows first:
   - `chat-assistant`
   - `generate-caption`
   - `generate-ideas`
   - `generate-carousel`
   - `generate-reply`
   - `generate-message-reply`
   - `automation-worker-ai-response`
4. Evaluate capability-by-capability whether these also move fully to OpenRouter:
   - `generate-image`
   - `research-topic`
5. Gate every AI tool by provider/model capability
6. Remove silent Gemini-only fallbacks from migrated flows

## Primary Files

- `supabase/functions/_shared/ai-config.ts`
- `supabase/functions/_shared/generate-text.ts`
- AI edge functions under `supabase/functions/*`
- `app/api/ai/*`
- `app/actions/settings.ts`
- `app/api/workspace/settings/route.ts`

## Exit Gate

- OpenRouter is first-class in settings and runtime
- Migrated text functions use one shared adapter
- No migrated flow silently falls back into Gemini-specific execution

## Locked Output

Later stages must preserve the shared-adapter architecture and avoid reintroducing per-function provider fragmentation.
