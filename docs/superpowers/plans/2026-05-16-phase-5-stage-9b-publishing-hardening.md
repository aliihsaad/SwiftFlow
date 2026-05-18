# Phase 5 Stage 9B Publishing Automation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove scheduled AI publishing automation can reliably create draft posts with generated media before adding auto-publish controls.

**Architecture:** Keep the first hardening pass draft-only. Add run history, idempotency, quality checks, and retry visibility. Auto-publish design starts only after draft creation succeeds repeatedly without manual repair.

**Tech Stack:** Supabase Edge Functions, scheduler-tick, publishing automation runner, media generation, posts/drafts, Next.js automation UI, Vitest.

---

## Research Checkpoint

- [ ] Review Meta publishing API constraints before designing future auto-publish controls.
- [ ] Review Vercel/Supabase function duration and retry behavior before changing runner timeouts.
- [ ] Review current image generation provider limits before adding run retries.

## Files

- Modify: `supabase/functions/process-publishing-automations/**`
- Modify: `supabase/functions/scheduler-tick/**`
- Modify: `lib/publishing-automation-readiness.ts`
- Modify: `lib/publishing-automation-image-generation.ts`
- Modify: `lib/publishing-automation-run-media.ts`
- Modify: `app/api/publishing-automations/**`
- Modify: `components/automation/**`
- Create/modify: `tests/publishing-automation-run-media.test.ts`
- Create: `tests/publishing-automation-idempotency.test.ts`

## Tasks

- [ ] Add visible run history showing due time, start time, end time, result, draft ID, media URL, prompt snapshot, error code, and retry state.
- [ ] Add idempotency key per automation/run window so repeated scheduler ticks cannot create duplicate drafts.
- [ ] Add concurrency protection around due-run selection.
- [ ] Add quality guardrails: missing account, missing brand profile, duplicate topic, empty caption, failed image generation, invalid media URL, unsupported platform combination.
- [ ] Add retry policy for transient provider failures with terminal failure after bounded attempts.
- [ ] Add manual "retry run" for failed draft-only runs.
- [ ] Add owner/admin pause/disable controls.
- [ ] Run one real production due-run and record evidence in docs/production.
- [ ] Design auto-publish controls only after at least three clean due-runs.

## Tests and Verification

- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test:ci`.
- [ ] Run targeted publishing automation tests.
- [ ] Trigger duplicate due-run attempts and verify one draft is created.
- [ ] Verify failed image generation creates a visible failed run, not a broken draft.

## Exit Gate

- [ ] Phase 5 is complete only after three consecutive due-runs create valid drafts with media and no duplicate side effects.
