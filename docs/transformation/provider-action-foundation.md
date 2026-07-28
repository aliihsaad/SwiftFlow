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
even resolves a credential.

1. `AUTOMATION_PROVIDER_ACTIONS_ENABLED` - default **false**
2. account resolved
3. account on `AUTOMATION_PROVIDER_ACTIONS_ALLOWLIST` - empty means none
4. automation `is_active`
5. self-loop protection - compares the comment author against the account's
   identity set, including `ig_user_id` and `webhook_account_id`
6. token present, not a placeholder, not expired, and required permissions held
7. bounded per-account rate limit

Credentials are resolved only after gate 7 passes.

## Single-replica constraint

`AccountRateLimiter` is per-process. Running N executor replicas permits N times
the intended rate, so **the staging deployment runs exactly one
action-executor replica and must continue to** until a shared limiter exists.

This is a rate ceiling concern only. The send-once guarantee comes from the
outbox unique identity and the transactional `FOR UPDATE SKIP LOCKED` claim,
both of which stay correct with multiple replicas.

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
permission, and safety when the adapter is misconfigured.
