# SwiftFlow Stable-v1 Release Checklist

**Feature freeze:** 2026-08-14

**Release baseline:** `623745a`

**Release state:** Repository verified; managed preflight pending
**Scope:** Instagram-only engagement automation on Vercel + managed Supabase

This is the single release record for stable v1. A checked item requires
evidence; intention is not evidence.

## A. Repository release lock

- [x] Stable-v1 scope is frozen in the canonical feature matrix.
- [x] README and roadmap describe Vercel + managed Supabase with no VPS path.
- [x] Facebook and publishing/generation/scheduling are outside the product contract.
- [x] New pull requests run automated tests, lint, and a production build.
- [x] `npm ci` succeeds with the CI npm version and production dependencies have no known high-severity advisory.
- [x] `npm run test:ci` passes on the release-lock branch.
- [x] `npm run lint` exits without errors or warnings.
- [x] `npm run build` passes with production-compatible configuration.
- [ ] `npm run setup:check` reports zero failures.

Repository evidence on 2026-08-14:

- Vitest: 78 files and 554 tests passed.
- ESLint: zero errors and zero warnings.
- Next.js 16.2.12 production build: passed, including TypeScript and all 66
  generated routes/pages.
- Clean install: `npm ci` passed with local npm and npm 10 (the GitHub Actions
  toolchain); `npm audit --omit=dev` reported zero vulnerabilities.
- Managed preflight: 10 checks passed; completion is blocked only by the local
  Supabase CLI session lacking access to the linked project and a missing local
  `INVITE_EMAIL_FROM`. Production Vercel variable names were present. The
  localhost callback warning is expected for local configuration and must be
  confirmed against the production Meta app manually.

## B. Clean managed deployment rehearsal

- [ ] A fresh Supabase project can be linked from the documented steps.
- [ ] All timestamped migrations apply without manual SQL edits.
- [ ] All functions required by `setup:check` deploy successfully.
- [ ] Required Supabase Function secret names are present without exposing values.
- [ ] The one-minute scheduler is installed and observed running.
- [ ] A fresh Vercel project deploys from the repository instructions.
- [ ] The private signup/setup flow creates the first owner account.
- [ ] `setup:check` reports zero failures against the fresh deployment.

Record the rehearsal date, operator, release commit, Vercel deployment, and
Supabase project reference without recording any secret values.

## C. Production acceptance

- [ ] Instagram Business/Creator connection reaches readiness 4/4.
- [ ] Real comment from a second account triggers exactly one workflow run.
- [ ] Reply to Comment and Private Reply produce the expected provider result.
- [ ] Real DM and Story Reply trigger their supported workflows.
- [ ] Send DM, Delay, Condition, AI Response, Telegram notification, and Telegram approval/rejection paths pass.
- [ ] Posts, reel playback, comments, inbox, and analytics load current provider data.
- [ ] Login, immediate logout navigation, recovery, private signup, and team invitation pass.
- [ ] Duplicate webhook replay creates no duplicate provider action.
- [ ] Execution history is complete, bounded, and credential-redacted.

## D. Recovery and operator checks

Use [`stable-v1-operations.md`](stable-v1-operations.md) for the recovery and
evidence procedure.

- [ ] Automatic Instagram token refresh succeeds before expiry.
- [ ] An unrecoverable token produces a clear reconnect state and optional Telegram alert.
- [ ] Retry/delayed work resumes after an interrupted invocation.
- [ ] Dead-letter state is visible and does not silently resend.
- [ ] Schema and data exports are created and checksummed.
- [ ] A restore rehearsal is documented against a disposable project.
- [ ] Previous Vercel deployment rollback is verified.
- [ ] Vercel runtime logs, Supabase Function/Cron logs, and Telegram alerts are checked.

## E. Seven-day release-candidate soak

Fill these fields when Gates A-D pass:

| Field | Value |
| --- | --- |
| Candidate commit | Pending |
| Production deployment | Pending |
| Soak start (UTC) | Pending |
| Soak finish (UTC) | Pending |
| Result | Pending |

Daily checks:

- [ ] Day 1
- [ ] Day 2
- [ ] Day 3
- [ ] Day 4
- [ ] Day 5
- [ ] Day 6
- [ ] Day 7

The soak restarts only for a release-blocking code or configuration change.

## F. Stable release

- [ ] All gates above have evidence.
- [ ] No unresolved P0/P1 release defect remains.
- [ ] Stable-v1 tag is created from the soaked commit.
- [ ] Release notes list the supported scope and known limitations.
