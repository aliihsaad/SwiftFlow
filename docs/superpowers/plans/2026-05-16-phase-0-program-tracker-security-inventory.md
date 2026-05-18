# Phase 0 Program Tracker and Security Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the canonical production tracking system, endpoint inventory, data-flow map, and threat model before any more security-critical implementation.

**Architecture:** This phase produces documentation and inventory artifacts that every later phase consumes. The inventory must be generated from code, then manually reviewed for missing business context such as cost impact, destructive behavior, and external-provider dependencies.

**Tech Stack:** Next.js App Router, Supabase Edge Functions, Supabase Postgres/Storage/Auth, Vercel, Meta Graph API, Developer API/MCP, Vitest.

---

## Research Checkpoint

- [x] Re-read OWASP API Security Top 10 2023 before finalizing the threat categories.
- [x] Re-read Supabase production checklist before finalizing database/security inventory.
- [x] Re-read Vercel production checklist before finalizing deployment/reliability gates.
- [x] If any endpoint depends on Meta, Stripe, OpenAI, Anthropic/MCP, Gemini, OpenRouter, DataForSEO, or SerpApi, open the current official docs before writing implementation requirements for that provider.
  - Phase 0 uses official OWASP, Supabase, Vercel, MCP, OpenAI Actions, and Stripe docs for gates. Meta-specific permission/app-review implementation remains a Phase 6 research checkpoint before changing Meta behavior or claims.

## Files

- Create: `docs/production/critical-roadmap-tracker.md`
- Create: `docs/security/api-inventory.md`
- Create: `docs/security/data-flow-map.md`
- Create: `docs/security/threat-model.md`
- Create: `docs/security/security-test-matrix.md`
- Read: `app/api/**/route.ts`
- Read: `supabase/functions/**/index.ts`
- Read: `lib/developer-api/*`
- Read: `lib/assistant/*`
- Read: `lib/meta-*`
- Read: `supabase/schema.sql`
- Read: `supabase/schema.live.sql`
- Read: `supabase/schema-map/*.csv`

## Tasks

- [x] Create `docs/production/critical-roadmap-tracker.md` with the 10 phases, status, owner, active branch, commit links, deployment links, Vault item IDs, and exit-gate status.
- [x] Generate a route list from `app/api/**/route.ts` and add each endpoint to `docs/security/api-inventory.md`.
- [x] Add every Supabase Edge Function to the same inventory, including scheduler, webhook, analytics sync, assistant, and publishing automation functions.
- [x] Add every MCP tool from `lib/developer-api/mcp.ts` to the inventory.
- [x] Classify each route/tool/function by authentication method: Supabase user session, Developer API key, OAuth connector token, Meta webhook signature, scheduler secret/internal call, public unauthenticated, or service-role-only.
- [x] Classify each route/tool/function by capability: read-only, write, destructive, expensive provider call, media/storage mutation, token/secret handling, external publish/send action.
- [x] Create `docs/security/data-flow-map.md` covering workspaces, posts, drafts, scheduled posts, media URLs, generated assets, analytics, automations, publishing automation runs, Developer API keys, OAuth connector tokens, Meta tokens, Stripe customer/subscription state, and assistant action proposals.
- [x] Create `docs/security/threat-model.md` with threats for BOLA, broken auth, property-level auth, function-level auth, resource exhaustion, SSRF/media uploads, unsafe third-party API consumption, token leakage, cost exhaustion, webhook replay, duplicate scheduler execution, and destructive action abuse.
- [x] Create `docs/security/security-test-matrix.md` listing the tests required for every critical endpoint and object type.
- [x] Add a "Known Unknowns" section where implementation must stop and research official docs before proceeding.

## Tests and Verification

- [x] Run `pnpm lint`.
  - Result: failed on existing repository lint baseline unrelated to Phase 0 docs.
- [x] Run `pnpm test:ci`.
  - Result: passed after rerun outside sandbox, 38 files and 145 tests.
- [x] Verify every `app/api/**/route.ts` appears in `docs/security/api-inventory.md`.
- [x] Verify every `supabase/functions/**` function appears in `docs/security/api-inventory.md`.
- [x] Verify every active Vault open loop maps to exactly one roadmap phase.

## Exit Gate

- [x] Phase 0 is complete only when the tracker, endpoint inventory, data-flow map, threat model, and test matrix exist and are linked from the master roadmap.
