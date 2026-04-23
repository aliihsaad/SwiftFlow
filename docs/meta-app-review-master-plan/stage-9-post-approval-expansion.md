# Stage 9: Post-Approval Expansion

Status: `planned`

Depends on: `Stage 8`

## Goal

Turn the approved publishing baseline into the full product in a controlled order, using the code that already exists in the repo while keeping permissions, UI claims, and operational behavior aligned.

## Current Starting Point

The repo already contains substantial implementation for the next product surface:

- Messaging UI and APIs: `app/dashboard/messages/page.tsx`, `app/api/live-messages/**`, `supabase/functions/sync-messages/index.ts`
- Analytics UI and sync pipeline: `app/dashboard/analytics/page.tsx`, `app/api/analytics/route.ts`, `app/api/sync-analytics/route.ts`, `supabase/functions/sync-analytics/index.ts`
- Automation builder and workers: `app/dashboard/automation/page.tsx`, `components/automation/**`, `supabase/functions/process-automations/**`, `supabase/functions/automation-worker-*/index.ts`
- Post/comments surface: `app/dashboard/posts/page.tsx`, `components/posts/**`, `app/api/posts-media/comments/route.ts`
- Subscription/plans placeholder: `app/pricing/page.tsx`, `components/settings/subscription-view.tsx`

That means Stage 9 is not greenfield feature work. It is mainly capability hardening, permission alignment, UX cleanup, and release sequencing.

## Non-Negotiable Rules

- New features must be capability-aware at both API and UI level.
- New permissions must be requested only when the visible product flow is ready to demonstrate them cleanly.
- Approved publishing flows must remain stable while adjacent modules are re-enabled.
- Public pricing and in-app billing copy must stay truthful until entitlements and checkout exist.

## Recommended Execution Order

### 1. Release Cleanup And Safety Baseline

Ship first:

- Remove Phase 1 review labels and reviewer-specific copy from the public UI.
- Keep release-channel gating until each module is promoted intentionally.
- Preserve the approved publishing path as the fallback-safe surface.

Before moving on:

- Decide whether `review_phase_1` remains as a hidden fallback channel or is renamed to a generic limited-release channel.
- Add a single rollout checklist covering env vars, nav visibility, and scope profile for each upcoming launch slice.

### 2. Analytics Expansion

Why second:

- The code is already present and the operational risk is lower than messaging or automation side effects.

Complete before launch:

- Reconnect accounts with exact granted-scope capture so the UI stops relying on heuristic permission states.
- Harden partial-data handling in combined Instagram/Facebook analytics views.
- Implement or explicitly defer export behavior so the header action is not a dead-end.
- Verify sync reliability for both manual sync and any scheduled/background sync path.

Primary files:

- `app/dashboard/analytics/page.tsx`
- `app/api/analytics/route.ts`
- `app/api/sync-analytics/route.ts`
- `supabase/functions/sync-analytics/index.ts`

Permission track:

- `pages_read_engagement`
- `instagram_manage_insights`

### 3. Comments And Post Engagement

Why third:

- Comment moderation is a natural extension of publishing and analytics, but needs a clearer surface than the current redirect from `comments` to `posts`.

Complete before launch:

- Decide the canonical UI: a dedicated comments inbox or comments embedded under posts only.
- Ensure reply, moderation, and fetch flows are permission-aware and recover cleanly from missing scopes.
- Validate webhook and polling interaction so comments do not duplicate or miss events.

Primary files:

- `app/dashboard/comments/page.tsx`
- `app/dashboard/posts/page.tsx`
- `components/posts/**`
- `app/api/posts-media/comments/route.ts`
- `supabase/functions/sync-comments/index.ts`

Permission track:

- `instagram_manage_comments`
- Any related Page engagement permission required by the final comment flow

### 4. Messaging Enablement

Why fourth:

- Messaging already exists, but it has the highest permission and policy sensitivity after automation.

Complete before launch:

- Resolve the current scope mismatch so the OAuth profile and DM surfaces agree.
- Make read/send capability states deterministic per connected account.
- Verify attachment previews, thread refresh, and send flows on both Instagram and Facebook.
- Remove any legacy or alternate auth path that can bypass the intended scope profile.

Primary files:

- `app/dashboard/messages/page.tsx`
- `app/api/live-messages/route.ts`
- `app/api/live-messages/send/route.ts`
- `supabase/functions/sync-messages/index.ts`
- `utils/meta-oauth.ts`

Permission track:

- `instagram_manage_messages`
- `pages_messaging`

### 5. Automation Promotion

Why fifth:

- Automation fans out into comments, messages, scheduling, AI responses, and worker execution. It should only be promoted after the underlying event sources are stable.

Complete before launch:

- Define the supported trigger/action matrix for the first public automation release.
- Verify every worker path against real account capability checks.
- Add operational observability for failed runs, retries, and disabled automations.
- Confirm the canvas, templates, and quick-setup wizard all produce supportable graphs.

Primary files:

- `app/dashboard/automation/page.tsx`
- `components/automation/**`
- `supabase/functions/process-automations/**`
- `supabase/functions/process-scheduled-executions/index.ts`
- `supabase/functions/automation-worker-*/index.ts`

Permission track:

- Inherits comment/message permissions from the promoted trigger/action set

### 6. Billing And Entitlements

Why last:

- The repo already has truthful placeholder copy. Billing should launch only after platform limits and enforcement points exist.

Complete before launch:

- Define a workspace-level subscription model and entitlement schema.
- Add enforcement points for connected accounts, automation volume, exports, and team seats.
- Add checkout/webhooks only after entitlement enforcement is working.
- Keep AI under BYOK unless there is a real decision to meter app-side AI usage.

Primary files:

- `app/pricing/page.tsx`
- `components/settings/subscription-view.tsx`
- future schema/migration files for subscriptions and entitlements

## Cross-Cutting Technical Work

These should run alongside every Stage 9 slice:

- standardize Meta Graph API versions across active code paths
- remove or hard-disable legacy OAuth paths
- encrypt Meta tokens at the application layer to match AI key handling
- add targeted regression coverage for publish, analytics sync, DM send/read, and automation execution
- keep privacy/terms/product copy aligned with the actually exposed feature set

## Suggested Milestones

1. `9A`: UI cleanup + release posture + analytics hardening
2. `9B`: comments/product engagement launch slice
3. `9C`: messaging permission and inbox launch slice
4. `9D`: automation public rollout
5. `9E`: billing foundation and entitlements

## Exit Gate

- Full product surfaces are re-enabled only when the permission set, UI copy, and live behavior match.
- The original approved publishing flow still works end to end after each milestone.
- No surface ships with placeholder claims that the backend cannot actually support.
