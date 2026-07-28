# Provider-action foundation

The safe path from "an automation matched" to "a provider action happened",
built so that no duplicate send is possible and every external call is gated.

**Status:** the outbox, executor, and gates are deployed to staging with the
kill switch OFF and the disabled adapter. The real Meta adapter is implemented
and rehearsed locally but is NOT deployed and NOT wired.

## Shape

```text
comparison worker  ->  automation_action_outbox  ->  action executor  ->  provider
(side-effect free)     (durable, idempotent)        (gated, single replica)
```

The comparison worker never makes an external call. It may eventually append an
intended action; execution is always someone else's job.

## Idempotency identity

A row is unique on:

```text
provider, provider_event_key, automation_id, workflow_version_id,
node_id, action_type, target_id
```

Replaying a webhook recomputes every component identically, so the insert is
skipped by the unique constraint. `workflow_version_id` pins the action to the
graph snapshot that produced it, so editing an automation mid-flight cannot
silently change what a queued action does.

Enqueue uses an untargeted `on conflict do nothing` with no `returning`, because
naming an arbiter or returning rows both require `select` privilege that the
insert-only comparison role deliberately lacks.

## Immutable workflow versions

`automation_workflow_versions` is the append-only graph ledger. Every
`workflow_graph` change captures a new numbered row and updates
`automations.current_workflow_version_id`. Version rows reject updates and
deletes, and composite foreign keys ensure a version UUID cannot be paired with
the wrong automation.

The same version ID is now stored on:

- `automation_action_outbox` for provider-action identity;
- `automation_runs` before a queued worker starts;
- `automation_scheduled_executions` for every delayed continuation.

Workers load the graph from the pinned version row, never from the editable
automation record. The interim content hash is retained only as nullable
`legacy_workflow_snapshot_id` audit data on pre-migration outbox rows.

This is the persistence and execution foundation. A separate product step will
add explicit draft-versus-published controls and rollback selection in the UI.

## The Meta private-reply endpoint

Verified against Meta's Instagram Platform private-replies documentation on
2026-07-27:

```text
POST https://graph.instagram.com/v23.0/<ig-user-id>/messages
Authorization: Bearer <token>
{ "recipient": { "comment_id": "..." }, "message": { "text": "..." } }
```

Success returns `recipient_id` and `message_id`.

Two details that matter and are easy to get wrong:

1. **Authentication is a Bearer header, not an `access_token` query parameter.**
   The token therefore never appears in a URL, a redirect, or a log line.
2. **The required permissions are `instagram_business_basic` and
   `instagram_business_manage_comments`** - the comment permissions, not the
   messaging ones. A private reply is authorised as a comment capability. An
   earlier version of the safety gate required
   `instagram_business_manage_messages` and would have wrongly suppressed a
   correctly-permissioned account.

Provider rules that shape the design: exactly **one** private reply is permitted
per comment, and only within **7 days** of the comment.

## Why an ambiguous result is never retried

A private reply is not idempotent at the provider. If the request is dispatched
and the response is lost - a timeout, a socket reset mid-flight - we cannot
prove whether Meta applied it. Retrying could either produce a second reply or
consume the single permitted send.

The adapter therefore distinguishes:

| Situation | Classification | Behaviour |
| --- | --- | --- |
| Request never dispatched (bad payload, unsupported action) | terminal | fail fast, no call made |
| Provider answered 429 / 5xx / 408 | retryable | backoff, honouring `Retry-After` |
| Provider answered other 4xx, or a terminal Meta code | terminal | dead-letter |
| Request dispatched, outcome unknown | **ambiguous** | dead-letter for reconciliation, never auto-retried |

Ambiguous rows land in `dead_lettered` with a code such as `request_timeout`, so
an operator can reconcile against Meta before deciding. Retrying is a human
decision, not an automatic one.

## Gates, in evaluation order

Every gate fails closed. The kill switch is first so a disabled deployment never
reaches later gate checks or the provider adapter.

1. `AUTOMATION_PROVIDER_ACTIONS_ENABLED` - default **false**
2. account resolved
3. account on `AUTOMATION_PROVIDER_ACTIONS_ALLOWLIST` - empty means none
4. automation `is_active`
5. self-loop protection - compares the comment author against the account's
   identity set, including `ig_user_id` and `webhook_account_id`
6. token present, not a placeholder, not expired, and required permissions held
7. local per-process burst limit
8. durable PostgreSQL reservation against both account and automation budgets
9. account and automation circuit breakers

The provider adapter receives the credential only after every gate and the
durable reservation pass.

## Distributed budgets and circuits

`reserve_automation_runtime_budget` serializes each account and automation scope
with transaction advisory locks, then consumes one unit from both scopes in the
same transaction. A missing or broken guard fails closed before the adapter.

Repeated provider failures open both scoped circuits. After cooldown, exactly
one half-open probe is admitted; a successful probe closes the circuits and a
failed probe reopens them. AI graph nodes use the same contract with independent
budgets and circuit state.

The in-memory `AccountRateLimiter` remains as a local burst smoother. The
staging Compose file still declares one executor as a conservative rollout
posture, but distributed budget correctness no longer depends on replica count.
The send-once guarantee remains the outbox unique identity plus transactional
`FOR UPDATE SKIP LOCKED` claim.

## Database roles

| Role | Outbox | Tokens |
| --- | --- | --- |
| `swiftflow_webhook_ingress` | none | none |
| `swiftflow_webhook_comparison` | column-level INSERT on the 7 identity columns only | none |
| `swiftflow_action_executor` | SELECT + lifecycle UPDATE + claim | `access_token` only, never `refresh_token` |

The executor is the only role in the topology that can read a credential, which
is precisely why the ingress and comparison roles never need one.

Note when auditing: `has_table_privilege` ignores column-level grants, so the
comparison role correctly reports `outbox_insert=false` at table level while
`has_column_privilege` confirms the intended per-column grant.

## Rehearsal

The full executor path is exercised against a recording transport that never
reaches Meta. The rehearsal proves the documented URL and body shape, Bearer
auth, that no token appears in any URL, body, log, or audit record, single send
on duplicate delivery, retry on rate limit with `Retry-After`, dead-letter on
terminal codes, dead-letter rather than retry on ambiguity, suppression for a
disabled switch / non-allowlisted account / self-authored event / missing
permission, safety when the adapter is misconfigured, atomic concurrent budget
enforcement, shared-account limits across automations, circuit opening, and
single-probe recovery.
