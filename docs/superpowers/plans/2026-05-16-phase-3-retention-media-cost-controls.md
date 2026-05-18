# Phase 3 Retention, Media Limits, and Cost Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent production database/storage/cost bloat while preserving user-visible history according to plan tier.

**Architecture:** Define retention and quota policy first, implement dry-run cleanup second, then enable destructive cleanup only after UI disclosure, grace periods, and audit logs exist.

**Tech Stack:** Supabase Postgres/Storage, scheduled cleanup Edge Function or RPC, Next.js Settings/Subscription UI, Developer API limits, Vitest.

---

## Research Checkpoint

- [ ] Review Supabase storage, backups/PITR, RLS, and production checklist before destructive cleanup.
- [ ] Review Vercel duration/cron/function limits before designing cleanup jobs.
- [ ] Review legal/privacy requirements for data deletion copy before exposing retention promises.

## Files

- Modify: `docs/app-review/ops/database-retention-cleanup-draft-2026-04-09.md`
- Create: `docs/production/retention-policy.md`
- Create: `docs/production/media-storage-policy.md`
- Create: `lib/retention/policy.ts`
- Create: `lib/retention/dry-run.ts`
- Create: `supabase/functions/cleanup-retention/index.ts`
- Modify: `lib/developer-api/rate-limit.ts`
- Modify: `components/settings/**`
- Modify: `app/pricing/page.tsx`
- Create: `tests/retention/retention-policy.test.ts`
- Create: `tests/retention/cleanup-dry-run.test.ts`

## Tasks

- [ ] Define Free, Paid, Pro, and internal/test workspace retention windows for analytics, generated assets, uploaded media, chat sessions, automation runs, publishing automation runs, API audit logs, and rate-limit buckets.
- [ ] Define media limits: total storage, monthly uploads, generated images, generated videos if added later, max file size, allowed MIME types, and public URL lifetime.
- [ ] Define cost limits: image generation, content intelligence, trend reports, Developer API calls, MCP calls, analytics refreshes, automation runs, and email sends.
- [ ] Implement `lib/retention/policy.ts` as the single source of truth for retention windows and plan quotas.
- [ ] Implement dry-run cleanup that reports exact candidate rows/files without deleting.
- [ ] Ensure cleanup never deletes media attached to active drafts, scheduled posts, published posts, automation templates, or audit-required events.
- [ ] Add audit logs for cleanup runs.
- [ ] Add grace periods for downgrade/expired subscription before destructive cleanup.
- [ ] Add Settings/Subscription and Data Deletion copy explaining retention.
- [ ] Add admin-only or owner-only cleanup visibility.

## Tests and Verification

- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test:ci`.
- [ ] Run dry-run cleanup against staging or a local seeded dataset and verify no protected media is selected.
- [ ] Verify rate-limit and quota errors are user-readable and do not expose internals.

## Exit Gate

- [ ] Phase 3 is complete only when cleanup dry-run is accurate, quotas are enforced for expensive actions, and user-facing retention copy exists.
