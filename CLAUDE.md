# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

The regression suite runs with npm run test:ci.

## Architecture Overview

This is a **Next.js 16 App Router** application for managing Instagram engagement through the Instagram Graph API focused on engagement automation, inbox workflows, and analytics.

### Core Stack
- **Next.js 16** (App Router, server + client components)
- **Supabase** (PostgreSQL + Auth + Storage + Edge Functions + Realtime)
- **OpenRouter / Gemini / OpenAI** for automation reply generation
- **Instagram Graph API v25.0** for account connection, engagement, inbox, and analytics
- **Tailwind CSS v4** + **shadcn/ui** (new-york style) + **Radix UI**
- **SWR** for client-side data fetching/polling
- **@xyflow/react** for the automation workflow canvas

### Path Aliases
`@/*` maps to the repo root.

### Multi-Tenancy Model
All data is scoped to `workspace_id`. The active workspace is tracked via a cookie (`active_workspace_id`). Every Supabase query should filter by workspace. Tables: `workspaces`, `workspace_members`, `workspace_settings`, `workspace_brand_profiles`.

### Data Fetching Patterns

1. **Server components** — Direct Supabase queries using `createClient()` from `@/utils/supabase/server`. Pass data as props to client children.
2. **Client components** — SWR hooks polling API routes for live data (posts, comments, messages).
3. **Server actions** (`app/actions/*.ts`) — Used for mutations (auth, settings, posts, workspace ops).
4. **API routes** (`app/api/`) — Handle third-party integrations, webhook callbacks, and background task triggers.

### Edge Functions
Supabase Edge Functions handle AI replies, sync operations, durable automation execution, delayed continuations, and maintenance. No active function publishes or generates social content.

### AI Integration Architecture
All AI calls (Gemini/OpenAI) go through a centralized config resolver:
- **Edge functions** use `supabase/functions/_shared/ai-config.ts` → `resolveAIConfig()` for key resolution, model validation, and error handling.
- **Error sanitization**: `toUserFriendlyError()` (edge) and `toUserFriendlyAIError()` (server) strip raw SDK errors into actionable messages.
- **Key validation**: `POST /api/ai/validate-key` tests keys before saving (used by settings form "Test Key" button).
- **Model defaults**: `gemini-2.0-flash` everywhere. Deprecated models (`gemini-pro`, `gemini-1.5-flash-latest`) are auto-upgraded.
- **Key resolution order**: workspace_settings (decrypted) → env fallback → clear error.

### Key Libraries
- `lib/ai-models.ts` — AI provider/model constants and defaults
- `supabase/functions/_shared/ai-config.ts` — Centralized AI config for all edge functions
- `utils/supabase/server.ts` — Server-side Supabase client
- `utils/supabase/client.ts` — Browser-side Supabase client

### Component Organization
- `app/dashboard/*/page.tsx` — Page-level server components
- `app/dashboard/layout.tsx` — Dashboard shell (auth guard, sidebar, workspace context)
- `components/` — Feature components organized by domain (`analytics/`, `automation/`, `posts/`, `messages/`, `scheduled/`, `settings/`, `dashboard/`)

### Automation Canvas
The automation builder uses `@xyflow/react` for a node-based workflow editor. Canvas components live in `components/automation/canvas/` with custom node types (`trigger-node`, `action-node`) and a `node-config-panel`.

### Environment Variables

```
# Required
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
APP_SECRETS_ENCRYPTION_KEY
INSTAGRAM_APP_ID
INSTAGRAM_APP_SECRET
META_WEBHOOK_VERIFY_TOKEN
NEXT_PUBLIC_APP_URL

# Optional global AI fallback
GEMINI_API_KEY

# Billing (Stripe) — all optional; billing routes return 503 when unset

# Retention cleanup (Supabase edge function secret)
RETENTION_CLEANUP_MODE     # off (default) | dry_run | enabled — destructive deletes only when enabled
```

Per-workspace Gemini API keys can be stored in `workspace_settings` and override the global `GEMINI_API_KEY`.

### Styling Conventions
- Tailwind v4 utility-first with CSS variables for theming
- `components.json` configures shadcn/ui — add new components via `npx shadcn@latest add <component>`
- Glassmorphism patterns (backdrop blur) are common in the UI
- Dynamic theming uses inline `style` objects alongside Tailwind classes
