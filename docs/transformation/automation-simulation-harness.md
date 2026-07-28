# Automation Simulation and Replay Harness

## Purpose

The harness proves the selected Instagram comment-to-private-reply automation
without calling Meta or requiring PostgreSQL. It runs the production webhook
normalizer, comparison handler, action planner, outbox identity, safety gates,
retry policy, and action executor against deterministic in-memory repositories.

The only injected provider capability is the recording adapter. It records that
an action would have been attempted, returns a queued synthetic outcome, and has
no network implementation.

## Scenarios

| Scenario | Invariant |
| --- | --- |
| `happy_path` | One fixture event produces one successful intended action. |
| `duplicate_delivery` | Replaying the provider event key creates one inbox row and one provider attempt. |
| `worker_crash_recovery` | A lease expires after action enqueue but before inbox completion; recovery repeats planning, deduplicates the action, and sends once. |
| `provider_outage` | A synthetic `503` schedules a bounded retry and records safe error metadata. |
| `retry_exhaustion` | Three synthetic failures consume the action budget and terminate in `dead_lettered`. |

Every report includes:

- `providerCapability: "recording_only"`;
- `networkCalls: 0`;
- sanitized inbox and action-outbox state;
- worker and executor counters;
- explicit boolean assertions used to decide pass or fail.

## Run locally

Run the complete suite:

```powershell
npx tsx workers/automation-simulation.ts
```

Run one scenario:

```powershell
npx tsx workers/automation-simulation.ts --scenario worker_crash_recovery
```

Supported scenario names:

```text
happy_path
duplicate_delivery
worker_crash_recovery
provider_outage
retry_exhaustion
```

## Replay a captured fixture

Captured payloads must be sanitized before they are saved or replayed. Remove or
replace usernames, comment text, account IDs, comment IDs, media IDs, and any
other user-identifying values. Never put access tokens, app secrets, signatures,
cookies, or HTTP headers in a fixture.

The selected slice accepts exactly one Meta `comments` event:

```powershell
npx tsx workers/automation-simulation.ts `
  --scenario duplicate_delivery `
  --fixture tests/fixtures/webhooks/meta-instagram-comment.json
```

The fixture is read from disk and passed directly to the production event
normalizer. The harness still uses only in-memory state and the recording
adapter.

## Safety boundary

- No database connection is opened.
- No environment credential is read.
- No live provider adapter is imported or constructed.
- No `fetch` call or provider URL exists in the simulation module or CLI.
- Enabling the in-memory executor gate does not enable deployment provider
  actions; it applies only to the recording adapter inside the process.
- The staging and production kill switches are unchanged.

## CI coverage

`tests/developer-api/automation-simulation.test.ts` runs every scenario twice and
requires byte-equivalent result objects, which catches clock, retry, ordering, or
identity nondeterminism.

`tests/security/automation-simulation-safety.test.ts` pins the no-network import
boundary and the recording-only report contract.
