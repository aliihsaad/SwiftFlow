# SwiftFlow Transformation Phase 0 Baseline

**Status:** In progress
**Captured:** 2026-07-26
**Branch:** `swiftflow-v2-transformation`
**Base commit:** `821adb38475b53853b0fe55d4111bc31bb71288d`

## Purpose

This document freezes the observable starting point for the automation-first,
self-hosted transformation. It is evidence for later comparisons; it is not a
claim that the current implementation is production-ready.

The authoritative roadmap is
`docs/superpowers/plans/2026-07-26-automation-first-self-hosted-transformation-roadmap.md`.

## Source-control baseline

- The neutral transformation branch was created from the base commit above.
- Existing tracked and untracked worktree changes were preserved.
- One pre-existing local-settings modification is outside transformation scope.
- Five pre-existing cleanup/archive directories are untracked.
- Two pre-existing self-hosting feasibility documents are untracked.
- The transformation roadmap is untracked until an intentional documentation
  commit is approved.
- No unrelated file has been staged, overwritten, moved, or deleted.
- A release tag has not been created yet because tags describe committed state;
  create it from the approved baseline commit, not from a dirty worktree.

## Package-manager decision

**Authoritative transformation package manager: npm.**

Evidence:

- repository operating commands use `npm run ...`;
- `package-lock.json` and `pnpm-lock.yaml` are both tracked and were last
  changed in the same commit;
- Phase 0 verification was executed through npm;
- `package.json` does not currently declare a `packageManager`.

Do not delete `pnpm-lock.yaml` during baseline capture. A dedicated cleanup
change must first confirm CI, deployment, and contributor workflows, then add a
pinned `packageManager` field and remove the non-authoritative lockfile.

## Runtime baseline

| Item | Observed value |
| --- | --- |
| Node.js | 24.11.0 |
| npm | 11.6.2 |
| Next.js | 16.2.10 |
| React | 19.2.3 |
| User-facing page files | 22 |
| Layout files | 2 |
| API route files | 89 |
| UI/feature TSX components | 108 across 16 component groups |
| Test source files found | 72, including helpers/mocks |
| Tests executed by Vitest | 70 files / 338 tests |
| Supabase Edge Function directories | 27, excluding `_shared` |
| Supabase migration files | 19 |
| App/component/lib files with Supabase coupling | 132 by Phase 0 search |
| Automation source files inspected | 107 |

Counts are method-dependent and are intended as migration trend indicators.
Every future count must use the same search command before being compared.

## Verification baseline

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run test:ci` | Pass | 70 files passed; 338 tests passed |
| `npm run lint` | Fail | 214 errors; 49 warnings |
| `npm run build` | Blocked before compile | Required local environment values are missing |
| `npx tsc --noEmit` | Fail | Six pre-existing typing errors in three older test files; none reported in the new guard files |

The build preflight reported these missing names:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

No secret value was read or recorded. A compile result remains unknown until a
valid local test configuration is supplied.

### Lint debt classification

The current lint failure is baseline debt, not a migration regression. The
largest classes observed are:

- explicit `any` types across API routes, components, and legacy functions;
- `@ts-nocheck` in legacy function modules;
- unused variables and `prefer-const`;
- unescaped JSX text;
- direct `img` usage;
- one React effect that synchronously sets local state.

New or modified transformation files must pass lint in their own scope. The
program should reduce the baseline count monotonically and must not hide the
existing failures by globally disabling rules.

## Environment-variable name inventory

Only names are recorded. Values must remain outside repository documentation.

### Application and release

- `APP_RELEASE_CHANNEL`
- `NEXT_PUBLIC_APP_RELEASE_CHANNEL`
- `NEXT_PUBLIC_APP_URL`
- `NODE_ENV`
- `VERCEL_GIT_COMMIT_SHA`

### Current backend

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Meta

- `NEXT_PUBLIC_META_APP_ID`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_OAUTH_SCOPE_PROFILE`
- `META_OAUTH_EXTRA_SCOPES`
- `META_OAUTH_INCLUDE_PAGES_MESSAGING`
- `INSTAGRAM_APP_SECRET`
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_USER_ID`
- `FACEBOOK_ACCESS_TOKEN`
- `FACEBOOK_PAGE_ID`
- `DEBUG_INSTAGRAM_MESSAGE_WEBHOOK_PAYLOAD`

### AI providers

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `NEXT_PUBLIC_ENABLE_TREND_RESEARCH_PANEL`

### Security, jobs, and retention

- `APP_SECRETS_ENCRYPTION_KEY`
- `SECRETS_ENCRYPTION_KEY`
- `CRON_SECRET`
- `RETENTION_CLEANUP_MODE`

### Email, developer access, and billing

- `RESEND_API_KEY`
- `AUTOMATION_EMAIL_FROM`
- `AUTOMATION_EMAIL_REPLY_TO`
- `AUTOMATION_FAILURE_ALERT_EMAIL`
- `AUTOMATION_FAILURE_ALERT_EMAILS`
- `INVITE_EMAIL_FROM`
- `INVITE_EMAIL_REPLY_TO`
- `DEVELOPER_API_ACCESS_MODE`
- `DEVELOPER_API_KEY_PEPPER`
- `BILLING_ENFORCEMENT_MODE`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXTAUTH_SECRET`

## Starting automation safety baseline

1. The arbitrary HTTP action is hidden from the canvas palette and rejected by
   both app and developer activation validation.
2. Follower-count and comment-count conditions were selectable in the node
   configuration UI.
3. The legacy executor evaluated both count conditions as `true` without
   fetching or comparing a metric. This was a P0 correctness issue.
4. Live canvas trigger support is currently comment, message, and story-reply.
5. The existing graph-backed, canvas-first model is authoritative. Templates
   may simplify creation, but they compile to the graph rather than introducing
   a second runtime model.

## First safety delta

Completed on 2026-07-26:

- Added one shared condition policy for the UI, app API, Developer API, and
  legacy executor.
- Removed placeholder count choices and numeric-only operators from normal
  condition configuration.
- App and Developer API activation validation reject both count conditions as
  temporarily disabled.
- The legacy executor now fails closed instead of treating them as true.

Verification:

- targeted automation regression set: 3 files / 32 tests passed;
- scoped modern-file lint: 0 errors / 2 pre-existing image warnings;
- full test suite: 71 files / 344 tests passed;
- TypeScript check: only the six recorded baseline test-typing errors.

## UI baseline

- There are 22 page files and 108 TSX feature/UI components.
- The three reference journeys are Meta onboarding, automation builder, and
  automation run inspection.
- Screenshot comparison is blocked until the application can run with a safe
  local test configuration.
- File-level route and component inventory is recorded in
  `docs/transformation/premium-ui-route-inventory.md`.
- The redesign may begin with tokens and isolated reference components, but it
  must not alter automation behavior before contract tests exist.

## Phase 0 exit checklist

- [x] Roadmap approved for implementation.
- [x] Neutral transformation branch created.
- [x] Base commit and unrelated dirty worktree recorded.
- [x] Authoritative package manager selected.
- [x] Stable-v1 feature matrix drafted.
- [x] Route and component inventory drafted.
- [x] Environment-variable names inventoried without values.
- [x] Existing test and lint baseline captured.
- [ ] Supply a safe local environment and capture a successful or failing
      production compile.
- [ ] Approve the OSS license.
- [ ] Decide default versus optional modules.
- [ ] Approve the visual direction and three reference designs.
- [ ] Produce a sanitized production-like database fixture.
- [ ] Rehearse database backup and restore.
- [ ] Set measurable webhook, queue, worker, and provider SLOs.
