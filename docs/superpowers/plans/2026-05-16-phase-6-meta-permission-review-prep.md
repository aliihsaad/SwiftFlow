# Phase 6 Meta Permission Review Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a reviewer-safe Meta app review package for the final selected Instagram/Facebook automation surfaces.

**Architecture:** Keep product flows narrow, demonstrable, and tied to exact permissions. Separate app bugs from Meta tester/app-review limits, and produce a clean reviewer script with evidence for each permission.

**Tech Stack:** Meta Graph API, Instagram/Facebook webhooks, app review docs, automation templates, screencast scripts, test accounts.

---

## Research Checkpoint

- [ ] Re-check official Meta Developer docs for permissions and app review requirements before changing this phase.
- [ ] Re-check current permission names and migration status for Instagram Business permissions before submission.
- [ ] Verify current Meta App Dashboard settings manually before recording final screencast steps.

## Files

- Modify: `docs/meta-app-review-master-plan/progress-tracker.md`
- Modify: `docs/meta-app-review-master-plan/stage-9a-approved-permission-stability-checklist.md`
- Modify: `docs/app-review/ops/phase-2-permission-audit-plan.md`
- Modify: `docs/app-review/evidence/review-phase-1-permissions-matrix.md`
- Modify: `docs/app-review/scripts/meta-review-screencast-phase-1.md`
- Modify: `docs/app-review/submission/final-reviewer-package-checklist.md`
- Read/modify: `lib/webhooks/instagram-automation-events.ts`
- Read/modify: `lib/meta-api.ts`
- Read/modify: `components/automation/**`

## Tasks

- [ ] Create a final permission matrix mapping each requested permission to the exact app screen, exact API call, exact webhook, and exact user value.
- [ ] Mark permission surfaces as one of: ready for review, blocked by Meta role/test-account limitation, needs product fix, deferred.
- [ ] Validate Instagram comment reply, private reply, DM reply, story reply, Facebook Page comment moderation, and publishing flows with role/tester accounts.
- [ ] Record known limitation: non-role accounts may not receive DM replies before approval; this is not necessarily an app bug.
- [ ] Prepare reviewer script with login, connect account, create automation, trigger event, observe result, and revoke/disconnect path.
- [ ] Add screenshots or short video evidence paths for each permission.
- [ ] Confirm privacy policy, data deletion, terms, and support links are live and aligned with review claims.
- [ ] Freeze product UI paths used in the screencast until review is submitted.

## Tests and Verification

- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test:ci`.
- [ ] Use tester accounts to trigger every review flow once.
- [ ] Verify webhook logs and app UI evidence match reviewer script.
- [ ] Verify no reviewer path depends on hidden/debug-only UI.

## Exit Gate

- [ ] Phase 6 is complete only when a reviewer can reproduce every requested permission flow from a clean script.
