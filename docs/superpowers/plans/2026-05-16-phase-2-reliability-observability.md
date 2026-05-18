# Phase 2 Reliability and Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make backend behavior traceable, retryable, idempotent, and safe under real production traffic.

**Architecture:** Standardize request IDs, structured logs, idempotency, retry/dead-letter behavior, and load tests across routes, MCP, Edge Functions, scheduler jobs, webhooks, and external provider calls.

**Tech Stack:** Next.js, Supabase Edge Functions, Supabase Postgres, Vercel logs, Developer API/MCP, Meta webhooks, Vitest, optional k6-style scripts.

---

## Research Checkpoint

- [ ] Review Vercel Observability, Log Drains, function duration, and load-test guidance.
- [ ] Review Supabase performance checklist, indexes, backups/PITR, and load testing guidance.
- [ ] Review Meta webhook retry/replay behavior in official docs before changing webhook processing.

## Files

- Create: `lib/observability/request-id.ts`
- Create: `lib/observability/structured-log.ts`
- Create: `lib/observability/error-codes.ts`
- Create: `docs/production/observability-runbook.md`
- Create: `docs/production/load-test-plan.md`
- Modify: `app/api/**/route.ts`
- Modify: `lib/developer-api/http.ts`
- Modify: `lib/developer-api/mcp.ts`
- Modify: `supabase/functions/scheduler-tick/**`
- Modify: `supabase/functions/process-publishing-automations/**`
- Modify: `supabase/functions/sync-analytics/**`
- Modify: `supabase/functions/meta-webhook/**`
- Create: `tests/reliability/request-id-propagation.test.ts`
- Create: `tests/reliability/idempotency.test.ts`

## Tasks

- [ ] Add a shared request ID helper for Next.js routes and Developer API/MCP calls.
- [ ] Standardize structured log fields: request_id, workspace_id, route/tool/function, operation, latency_ms, result, safe_error_code, external_provider, cost_units, and target_object_id.
- [ ] Add request ID propagation into Supabase Edge Function calls where callers control headers/body.
- [ ] Add a tracing runbook that explains how to trace one ChatGPT/Claude/MCP failure from user request ID to Vercel logs and Supabase logs.
- [ ] Add idempotency keys for scheduled publishing, publishing automation runs, webhook events, media generation attach, and automation execution.
- [ ] Add concurrency locks for due-run processing so duplicate scheduler ticks cannot create duplicate drafts or publish twice.
- [ ] Add retry and terminal failure behavior for automation/publishing runs with human-readable failure reasons.
- [ ] Add webhook replay protection for Meta events.
- [ ] Add load-test plan for key flows: Developer API auth, MCP tools/list, MCP tool call, analytics refresh, media upload, media generation, scheduler tick, webhook burst, and assistant command route.
- [ ] Add error-code taxonomy that distinguishes user fixable, provider transient, permission missing, quota/rate limit, internal bug, and security denial.

## Tests and Verification

- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test:ci`.
- [ ] Run targeted reliability tests.
- [ ] Manually trigger a known failing MCP call and verify request ID appears in every relevant log surface.
- [ ] Simulate duplicate scheduler/webhook events and verify only one side effect occurs.

## Exit Gate

- [ ] Phase 2 is complete only when critical flows have request IDs, idempotency, structured failure states, and documented tracing instructions.
