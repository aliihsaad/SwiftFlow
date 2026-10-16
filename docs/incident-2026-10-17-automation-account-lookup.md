# Automation account lookup incident — 17 October 2026

## Cause and impact

The backend release completed on 16 October at 21:12:44 UTC (23:12 Berlin). The new `instagram_campaign_deliveries` table introduced a PostgREST many-to-many relationship between `automations` and `social_accounts`. Existing queries embedded `social_accounts(...)` without naming their intended foreign key. PostgREST now found both the original direct relationship and the new join-table relationship, returning HTTP 300 / `PGRST201`.

The run worker claimed a run before loading its automation/account. The failed lookup threw before graph execution. Its outer exception handler returned HTTP 500 without saving a terminal run state. Runs therefore remained `running`, then the scheduler marked them abandoned after 30 minutes with no useful original error and an error count of zero.

The affected cohort contained 35 runs: 31 WinDock comment runs and four follower-check message runs. Their checkpoints, node-run records, execution events and scheduled continuations were empty. The two additional `skipped` message runs were intentional cooldown suppressions and were not replayed.

The previous deployment checks verified module boot, authentication, missing-input rejection, migrations and effective cooldown settings. They did not execute the claimed-run account lookup. Graph tests mocked that boundary, while PostgreSQL integration tests did not exercise PostgREST relationship discovery. Passing those checks did not demonstrate that an actual production run could start.

## Correction

- Explicitly select `social_accounts!automations_social_account_id_fkey(...)` in the initial worker, delayed graph resume, webhook processor and polling processor.
- Persist unexpected exceptions immediately as `failed` with a sanitized error and nonzero error count, scoped to the run claimed by that invocation and only while its status remains `running`.
- Preserve existing action checkpoints and counts. An exception does not automatically requeue a run or authorize another provider send. A failed persistence attempt is logged separately and does not hide the original exception.

The live ambiguous lookup was reproduced and the explicit relationship returned HTTP 200 before deployment. The account-lookup correction reached the worker and scheduler at 22:49:33 UTC, then the polling processor at 22:49:37 UTC. The worker's durable exception handling was deployed afterward. All authentication settings were preserved. The recipient cooldown and existing retry/send budgets remain active. Public DM restriction fallback remains disabled.

## Recovery

The incident runs were audited against checkpoints, timeline events, scheduled work, private-delivery records, other runs and Instagram comment replies. Twenty-nine comments had no public replies or private-delivery records. Four inbound message runs had no delivery evidence. One original comment run was requeued first and completed successfully, followed by the other 32 eligible original runs through the existing queue.

Recovery reuses the original run IDs and pinned workflows. A conditional database update rechecks state and records an `_incident_recovery` marker with the prior status/error and requeue time; rerunning the recovery operation cannot requeue those rows again. No new execution pipeline or unlimited resend loop was introduced.

Two comments remained inaccessible through Meta's API, returning code 100 / subcode 33 for both the comment and its replies. This does not prove deletion or a messaging restriction. They were left unretried with an explicit review reason and an `_incident_review` record. No public fallback was triggered.

Operational audit files, original run snapshots, provider checks and recovery manifests are in the ignored local directory `tasks/incident-20261017/`. They contain recipient identifiers and are intentionally not committed. The historical backend source backups remain under `tasks/backend-rollout-20261016/rollback/`.

## Verification and deployment lessons

The regression suite passed 697 tests across 90 files. Seven new tests execute the actual worker entrypoint with controlled dependencies: direct relationship selection, pre-graph lookup failure, graph exception, duplicate claim, failed claim, error redaction and failure-state persistence errors. ESLint passed with only the two existing navigation warnings. Live canary and naturally arriving comment/follower runs completed after the correction.

Future schema releases that add join tables must check affected PostgREST embeds against the resulting schema. A deployment check must exercise the actual account lookup and a controlled execution path, not just authentication/invalid-input branches. Immediate terminal error recording is necessary to distinguish worker failure from genuine queued/delayed work. Observe an actual successful execution before reporting delivery health.
