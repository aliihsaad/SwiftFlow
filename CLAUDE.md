# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

No test suite is configured. There is no test command.

## Architecture Overview

This is a **Next.js 16 App Router** application for managing social media (Instagram/Facebook via Meta Graph API) with AI-powered content generation.

### Core Stack
- **Next.js 16** (App Router, server + client components)
- **Supabase** (PostgreSQL + Auth + Storage + Edge Functions + Realtime)
- **Google Gemini AI** for content generation
- **Meta Graph API v24.0** for Instagram/Facebook integration
- **Tailwind CSS v4** + **shadcn/ui** (new-york style) + **Radix UI**
- **SWR** for client-side data fetching/polling
- **@xyflow/react** for the automation workflow canvas
- **@dnd-kit** for drag-and-drop (calendar rescheduling)

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
23 Deno-based Supabase Edge Functions in `supabase/functions/`. They handle AI generation (`generate-ideas`, `generate-caption`, `generate-image`, `generate-carousel`, `chat-assistant`), sync operations (`sync-analytics`, `sync-comments`, `sync-messages`), automation (`process-automations`, `automation-orchestrator`, plus 7 `automation-worker-*` functions), and scheduling (`process-scheduled-posts`, `scheduler-tick`). API routes fire-and-forget trigger these functions.

### Key Libraries
- `lib/meta-api-client.ts` — Typed Meta Graph API client
- `lib/gemini.ts` — Gemini AI integration (supports per-workspace API keys)
- `utils/supabase/server.ts` — Server-side Supabase client
- `utils/supabase/client.ts` — Browser-side Supabase client

### Component Organization
- `app/dashboard/*/page.tsx` — Page-level server components
- `app/dashboard/layout.tsx` — Dashboard shell (auth guard, sidebar, workspace context)
- `components/` — Feature components organized by domain (`analytics/`, `automation/`, `posts/`, `messages/`, `scheduled/`, `settings/`, `dashboard/`)
- `app/dashboard/assistant/` — AI chat interface (has its own sub-components directory)

### Automation Canvas
The automation builder uses `@xyflow/react` for a node-based workflow editor. Canvas components live in `components/automation/canvas/` with custom node types (`trigger-node`, `action-node`) and a `node-config-panel`.

### Environment Variables

```
# Required
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
GEMINI_API_KEY
NEXT_PUBLIC_META_APP_ID
META_APP_SECRET
META_WEBHOOK_VERIFY_TOKEN
NEXT_PUBLIC_APP_URL

# Optional
UNSPLASH_ACCESS_KEY
INSTAGRAM_APP_SECRET
```

Per-workspace Gemini API keys can be stored in `workspace_settings` and override the global `GEMINI_API_KEY`.

### Styling Conventions
- Tailwind v4 utility-first with CSS variables for theming
- `components.json` configures shadcn/ui — add new components via `npx shadcn@latest add <component>`
- Glassmorphism patterns (backdrop blur) are common in the UI
- Dynamic theming uses inline `style` objects alongside Tailwind classes
