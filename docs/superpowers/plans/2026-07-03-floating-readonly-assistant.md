# Floating Read-Only Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional dashboard-wide floating AI assistant that is read-only, workspace-scoped, and controlled from Settings -> AI Provider.

**Architecture:** Persist a workspace boolean `floating_assistant_enabled`, mount a compact dashboard widget only when enabled, and route its messages through a server-side read-only assistant command path. The UI hides generation/write controls, and the API rejects non-read-only modes/actions/functions so browser tampering cannot create content or mutate state.

**Tech Stack:** Next.js App Router, Supabase workspace settings, shadcn/Radix UI, existing assistant context and `chat-assistant` Edge Function, Vitest.

---

### Task 1: Workspace Setting

**Files:**
- Create: `supabase/migrations/20260703130000_add_floating_assistant_setting.sql`
- Modify: `types/settings.ts`
- Modify: `lib/security/phase1-validation.ts`
- Modify: `app/actions/settings.ts`
- Modify: `app/api/workspace/settings/route.ts`
- Modify: `components/settings/api-settings-form.tsx`

- [ ] Add `floating_assistant_enabled boolean not null default false` to `workspace_settings`.
- [ ] Include the boolean in default settings returned by server actions and API routes.
- [ ] Allowlist and persist the boolean in settings update paths.
- [ ] Add a switch in AI Provider Settings labeled `Floating read-only assistant`.

### Task 2: Read-Only Assistant API

**Files:**
- Modify: `lib/assistant/context-types.ts`
- Modify: `app/api/assistant/command/route.ts`
- Test: `tests/developer-api/assistant-command-route.test.ts`

- [ ] Accept an optional `surface: "full" | "floating"` in assistant command requests.
- [ ] For `surface: "floating"`, force `mode: "ask"`, `action: "general_chat"`, and `functionName: "chat-assistant"`.
- [ ] Reject attempts to use floating surface with generation/write functions or non-read-only actions.
- [ ] Pass assistant context as normal so the mini assistant can answer page/workspace questions.

### Task 3: Floating Widget

**Files:**
- Create: `components/assistant/floating-assistant.tsx`
- Modify: `app/dashboard/layout.tsx`

- [ ] Render a fixed icon button on dashboard pages except `/dashboard/assistant`.
- [ ] Open a compact panel on desktop and mobile with a short message list and textarea.
- [ ] POST to `/api/assistant/command` with `surface: "floating"`.
- [ ] Show friendly errors and keep controls stable on small screens.

### Task 4: Verification

**Files:**
- Test: `tests/developer-api/floating-assistant-settings.test.ts`
- Test: `tests/developer-api/floating-assistant-widget.test.tsx` if the project test environment supports it; otherwise use source-level route/widget regression tests consistent with current tests.

- [ ] Verify the settings sanitizer and action payload allow the flag.
- [ ] Verify the floating API cannot route generation functions.
- [ ] Run `npm run test:ci`.
- [ ] Run `npm run build` with env loaded.
