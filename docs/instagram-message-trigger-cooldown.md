# Instagram message trigger cooldown

Repeated “I Followed” messages and button taps have different Meta message IDs. Webhook deduplication therefore correctly treats them as distinct events, but previously each could start the same follower-check workflow. Account-wide send budgets only delayed the resulting sends.

## Behavior

The New Message trigger now supports `recipient_cooldown_seconds`:

- Omitted (Automatic): 60 seconds for Instagram workflows containing an `instagram_follower_status` condition; off for other workflows.
- `1`–`3600`: a custom cooldown in seconds.
- `0`: disable this trigger guard, including its active-run check.

While enabled, admission is scoped to workspace, connected Instagram account, automation and sender. A new message is skipped if the same message/event was already admitted, a previous run is queued/running/waiting, or the last admitted run started within the cooldown. Skipped attempts do not extend the cooldown. A new message after the cooldown can start another follower check once the earlier run is terminal.

This is SwiftFlow's application policy, not a Meta API limit. It does not prevent a person from messaging or calling in Instagram. It sends no “slow down” response and does not accumulate delayed replies. It is not permanent resource-delivery deduplication: after the cooldown, existing campaign delivery guards still determine whether a resource may be sent.

The first eligible run, its follower check, checkpointed retries, continuations and resource rules are unchanged. Existing comment triggers and ordinary message workflows remain unchanged by the automatic default. Existing queued work is not cancelled retroactively. A stuck active run must be resolved through existing recovery/maintenance mechanisms; another tap cannot bypass it.

## Implementation

`20261017100000_instagram_message_trigger_cooldown.sql` adds a BEFORE INSERT trigger to the existing `automation_runs` table and an index for recipient lookups. It executes after immutable workflow version pinning, evaluates that version's configuration, and takes a transaction-level advisory lock before checking prior runs. The insert and admission commit together; a rolled-back insert consumes no cooldown.

The database stamps the connected account into `trigger_context`, which worker completion preserves. Older runs without the stamp are conservatively treated as belonging to the automation's current account. Suppressed rows have status `skipped`, zero processing/send/error counts, and an existing `suppressed` timeline event without sender/message content. The activity panel explains the suppression. The existing total “runs” count includes these recorded attempts; they are not failures or completed deliveries.

The orchestrator skips worker dispatch for suppressed rows. The existing worker's queued-only claim also protects direct/internal dispatch. Ordinary and recovery DM runs share this admission check. `consume_instagram_recovery` records a suppression outcome in the existing receipt instead of falsely reporting that it queued a run; replaying that webhook cannot become eligible later. A new inbound message is required to retry.

## Configuration and rollout

In the workflow editor, select **New Message → Cooldown per person (seconds)**. Leave it blank for Automatic or enter a custom value. New paired follower campaigns explicitly use 60 seconds and tell non-followers to wait one minute before tapping again. Existing campaign messages and keywords are not rewritten.

Backend deployment is required; a GitHub/Vercel frontend deploy alone cannot activate this protection:

1. Apply the existing workflow-version and timeline migrations, the additive `20261017090000_instagram_dm_recovery.sql`, then `20261017100000_instagram_message_trigger_cooldown.sql` in order. Review the migration plan before applying unrelated pending migrations.
2. Deploy `automation-orchestrator` with the existing internal authentication settings. If the preceding DM recovery backend release has not shipped, follow its complete migration/function deployment order in [the recovery guide](./instagram-dm-restriction-recovery.md#rollout).
3. Deploy the Next.js application through the established GitHub/Vercel workflow.
4. Verify a consenting test follower workflow: first tap starts one run, rapid repeats show suppressed, a new tap after 60 seconds and terminal completion can retry, and another recipient is immediately eligible.

Applying this migration enables the automatic 60-second guard for existing follower-check graphs without rewriting their configurations. It does **not** enable DM restriction public fallbacks, add an error signature, or change WinDock's keyword/resource. Those remain separately gated.

## Rollback

Set the New Message trigger's cooldown to `0` and save a new workflow version to opt out for future executions. Already pinned versions retain their settings. To stop enforcement across all versions, an operator can disable only `automation_runs_throttle_message` on `public.automation_runs`; re-enable it to restore enforcement. Keep suppression history and recovery receipts. Do not requeue skipped rows or replay suppressed receipts: those messages were intentionally dropped.

## Validation

Local validation passed: 690 regression tests across 89 files, plus 28 PostgreSQL integration tests across the cooldown and DM recovery suites. The database tests include 50 simultaneous taps (one admitted, 49 suppressed), active-run checks, cooldown expiry, repeat webhook IDs, transaction rollback, immutable versions, account/workspace/recipient isolation, account reassignment after worker persistence, explicit opt-out, unaffected comment/ordinary-message flows, and shared recovery admission.

The production build/TypeScript check and Deno module checks passed. ESLint reported zero errors and the two existing onboarding/settings navigation warnings. Deno module validation does not fully typecheck the legacy `@ts-nocheck` orchestrator.

```powershell
npm run test:ci
npm run lint -- --ignore-pattern 'tasks/**'
npm run build
# Use an isolated localhost test database, never production.
npx vitest run --config vitest.postgres.config.ts tests/integration/message-trigger-cooldown-postgres.integration.test.ts tests/integration/dm-recovery-postgres.integration.test.ts
deno check --no-lock supabase/functions/_shared/message-trigger-policy.ts supabase/functions/automation-orchestrator/index.ts
```

No live Instagram messages or production campaign changes were made during these tests. Authenticated editor/browser and live Meta checks remain rollout validation.
