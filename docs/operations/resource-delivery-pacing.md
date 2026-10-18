# Resource delivery and provider pacing

The October 18 audit found repeated WinDock resource sends from distinct inbound
messages outside the 60-second recipient cooldown. Retries were not replaying
completed nodes. Account send allowances were also exhausted at 60 actions per
fixed hour, concentrating continuations and scheduler HTTP timeouts at hour boundaries.

## Delivery protection

The existing `instagram_campaign_deliveries` ledger is the authority for an opted-in
resource node. Its key includes workspace, Instagram account, entry campaign,
delivery kind and recipient. Follower verification still runs before claiming.
The claim now precedes provider budget reservation: an already-sent resource skips
without spending send capacity, and reports `already_delivered_skipped` with zero DMs.
A definite pre-send budget/circuit denial releases only its own claim and uses the
existing durable continuation. Accepted sends and uncertain outcomes never release
their claim automatically.

New paired follower campaigns bind the resource node's `resource_campaign_id` to
the entry automation's explicit UUID in the same two-row INSERT. Both remain drafts.
The not-following reminder is unguarded so the user can follow and try again.
Other existing workflows retain their configuration. DM restriction fallback stays
disabled; no Meta restriction signatures were added.

Guarded delivery sends the configured opening and resource together in one message.
The existing optional button-to-text fallback runs only after a structured HTTP 400
rejection with no provider message ID, excluding normalized rate, authentication
and transient errors. Timeouts, malformed responses, 5xx and accepted messages never
trigger that second attempt. Unconfigured send nodes keep their existing behavior.

The ledger cannot prove provider delivery after a lost response. Such claims stay
`sending` or `unknown` for review rather than risking a duplicate. This is at-most-one
accepted attempt where the provider response can be confirmed, not an assertion of
exactly-once delivery across a network failure.

## Smoother pacing and scheduler acknowledgment

Apply `20261018170000_smooth_provider_send_budget.sql`. It replaces the existing
budget RPC without changing its arguments, return fields, advisory-lock order or
circuit-breaker behavior. `provider_send` uses a persistent token bucket, with the
same configured capacity and refill rate: default 60 tokens, one token per minute.
Both account and automation must have capacity. Initial state subtracts the current
fixed-window usage, avoiding a new deployment burst. Changes to configured limits
clamp available capacity and refill conservatively. AI retains fixed-window limits.

This is a burst allowance plus sustained rate, **not a strict 60-in-every-rolling-hour
limit**. Existing hourly bucket rows remain usage counters; they can exceed 60 after
this change. Meta rate-limit rejections still defer through the existing queue. The
new service-only table stores one row per scope, not one per event. It has no foreign
key to automations or social_accounts that could introduce ambiguous PostgREST joins.

The scheduler uses `EdgeRuntime.waitUntil` and returns HTTP 202 promptly. This means
accepted, not completed. Actual worker results remain in scheduler logs and durable
run/checkpoint tables. Job invocation is bounded at 120 seconds, below Supabase Free's
documented 150-second wall-clock limit. Local runtimes without `waitUntil` await
completion. A timeout never directly replays a send.

References: [Supabase background tasks](https://supabase.com/docs/guides/functions/background-tasks),
[Edge Function limits](https://supabase.com/docs/guides/functions/limits).

## Rollout

1. Run the regression suite, source lint, TypeScript and Deno checks. Run the recovery
   and pacing PostgreSQL integration tests against an isolated local test database.
2. Confirm the CLI project is `social-media-ai-manager` (`txomrdymcawauezlprvn`).
   Save the current WinDock graphs/version IDs and budget function for rollback.
3. Deploy `automation-worker-send-dm`, `process-automations`, `automation-worker-run`
   and `process-scheduled-executions`, retaining their existing JWT settings.
4. On **Windock followers check**, set **Resource delivery for campaign** to
   **WinDock** on the resource node `node-1787783267106-8` only. Do not change the
   not-following reminder, keyword, four-second delay, resource URL or follower branch.
   Use a version-checked update and preserve all other graph fields.
5. In the same transaction, seed the delivery ledger from retained successful DM
   events for that exact resource node/account/workspace. Select one record per
   recipient and use `ON CONFLICT DO NOTHING`. The existing claim RPC also lazily
   checks historical sends, covering previously pinned runs that finish afterward.
   Old run versions/checkpoints must not be rewritten or replayed.
6. Apply the pacing migration and deploy `scheduler-tick`; push the template/API
   changes through normal GitHub/Vercel CI. Do not run unrelated pending migrations.
7. Observe organic traffic: 202 scheduler acknowledgments plus completed jobs,
   no overdue queue growth, successful follower checks, zero new duplicate resource
   provider IDs per campaign/recipient, and `already_delivered_skipped` for repeats.
   Do not send test DMs to real recipients.

Historical records can only protect recipients still represented in retained data.
Backfill them before cleanup removes the events. Never delete sent/unknown delivery
records as part of routine log cleanup. Existing old workers finish pinned graphs;
the per-recipient in-flight admission guard prevents a new ordinary confirmation
from racing those runs.

## Rollback

Restore the previous budget RPC from `20260728120000_add_automation_runtime_guards.sql`
to return to hourly windows; retain usage buckets and token rows. Redeploy the previous
scheduler if necessary. Neither action requires replaying any run. Keep the resource
delivery guard and ledger intact even if rolling back pacing. If the resource change
itself must be reverted, pause its verifier first and inspect in-flight/unknown claims;
removing the guard while accepting repeated confirmations reintroduces duplicates.
Restore only the reviewed configuration field from the saved graph, never overwrite
new user edits or delete delivery history.
