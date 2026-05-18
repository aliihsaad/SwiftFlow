# Phase 4 AI Assistant Confirmed Write Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the AI Assistant safely create and update app objects through explicit confirmation, diffs, audit logs, and mobile-friendly action cards.

**Architecture:** Assistant responses produce structured action proposals, not direct mutations. The UI renders review cards with exact target, before/after diff, scopes/side effects, and confirm/cancel controls. Confirmed actions call server routes that re-check auth, workspace ownership, and permissions.

**Tech Stack:** Next.js, Supabase Edge Function `chat-assistant`, assistant context packs, Radix UI, Vitest, Developer API helper patterns.

---

## Research Checkpoint

- [ ] Review current assistant model/provider behavior before changing prompt contracts.
- [ ] Review security Phase 1 results before enabling any new write route.
- [ ] If using connector parity, review MCP tool schemas before reusing action payloads.

## Files

- Modify: `lib/assistant/context-packs.ts`
- Modify: `lib/assistant/context-selection.ts`
- Create: `lib/assistant/action-types.ts`
- Create: `lib/assistant/action-diff.ts`
- Create: `app/api/assistant/actions/route.ts`
- Modify: `app/api/assistant/command/route.ts`
- Modify: `components/ai-assistant/**`
- Modify: `supabase/functions/chat-assistant/index.ts`
- Create: `tests/developer-api/assistant-action-proposals.test.ts`
- Create: `tests/developer-api/assistant-action-confirmation.test.ts`
- Create: `tests/developer-api/assistant-action-mobile-layout.test.ts`

## Tasks

- [ ] Define supported action types: create draft, update draft text, update draft media, schedule post, generate media and append, edit brand profile, create automation from template, activate/deactivate automation.
- [ ] Add a typed action proposal schema with id, title, risk level, target object, required permission, before state, after state, side effects, and confirmation mode.
- [ ] Update assistant prompt contract so write-capable answers return proposals instead of saying they already changed data.
- [ ] Render action proposal cards inside chat with mobile-first layout.
- [ ] Add before/after diff components for text, schedule, media URLs, brand profile fields, and automation template config.
- [ ] Add confirm/cancel controls with loading states and disabled duplicate submission.
- [ ] Add stronger confirmation for destructive actions; do not include delete actions in the first release unless Phase 1 explicitly approves them.
- [ ] Implement server-side action executor with auth, workspace membership, object ownership, rate limits, and audit logs.
- [ ] Add audit log entries for every assistant write.
- [ ] Add UX fallback when an action cannot be executed due to missing scope, stale object, or changed data.

## Tests and Verification

- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test:ci`.
- [ ] Add tests that unconfirmed actions perform no writes.
- [ ] Add tests that stale/foreign workspace targets fail.
- [ ] Add mobile layout tests that action cards cannot stretch the chat viewport.
- [ ] Smoke-test create draft, schedule draft, brand profile edit, and automation toggle in production/staging.

## Exit Gate

- [ ] Phase 4 is complete only when assistant write actions require explicit confirmation, show diffs, audit writes, and pass cross-workspace denial tests.
