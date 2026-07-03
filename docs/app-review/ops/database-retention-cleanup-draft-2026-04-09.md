# Database Retention Cleanup Draft

Date: `2026-04-09`
Status: `reviewed draft`

This note is a planning draft for a future retention/cleanup job. It is not implemented yet.

## Current Review

Reviewed on `2026-05-12`.

The plan is still useful, but it should not be executed as a simple global cleanup policy. Retention now needs two layers:

1. **Safety cleanup** for temporary, dedupe, queue, and operational records that are not user-facing product history.
2. **Subscription-aware retention** for user-visible history and higher-value records, especially analytics, AI generation history, publishing automation run history, and potentially automation execution history.

Billing is not live yet and there is no enforced workspace subscription/entitlement model in production, so tier-aware retention should be designed now but enforced only after the billing foundation exists.

Live production table check on `2026-05-12` showed these rough row counts:

| Table | Approx rows | Note |
| --- | ---: | --- |
| `oauth_page_sessions` | 1 | safe expired-session cleanup target |
| `workspace_invites` | 1 | safe lifecycle cleanup target |
| `webhook_events` | 1254 | active growth; good v1 target |
| `processed_comments` | 0 | low risk, keep rule for future growth |
| `automation_events` | 1171 | active growth; good v1 target |
| `automation_logs` | 0 | legacy, keep rule |
| `automation_runs` | 56 | operational history; can become tier-aware |
| `automation_node_runs` | 150 | operational history; can become tier-aware |
| `automation_scheduled_executions` | 12 | queue history; safe terminal cleanup target |
| `generated_assets` | 38 | user-visible/high-value; defer destructive cleanup until tier policy is set |
| `chat_sessions` | 36 | user-visible; defer to tier policy |
| `analytics_snapshots` | 0 | defer until analytics retention policy is finalized |
| `account_analytics` | 40 | tier-aware retention candidate |
| `post_analytics` | 74 | tier-aware retention candidate |
| `publishing_automations` | 1 | core product config; do not auto-delete |
| `publishing_automation_runs` | 10 | tier-aware operational/history candidate |

`rate_limit_buckets` exists by migration, but the live REST check returned `403`; the cleanup function may need a dedicated security-definer cleanup RPC or explicit grants before it can delete old rows safely.

## Goal

Add a separate maintenance cleanup function that removes expired temporary data, old operational logs, and orphaned generated assets without touching core product records or the Meta Phase 1 review flow.

## Scheduling Direction

Do not attach cleanup work to the current minutely scheduler path.

Current minutely scheduler:
- `scheduler-tick`
- runs:
  - `process-scheduled-posts`
  - `process-scheduled-executions`
  - `process-publishing-automations`

Recommended cleanup model:
- create a separate edge function, e.g. `cleanup-retention`
- run it on a separate schedule
- default cadence: `daily`

Optional later split:
- `hourly` for very short-lived temp data
- `daily` for logs, dedupe tables, and orphaned assets

Important:
- do not add cleanup work to `scheduler-tick`
- do not add cleanup to Vercel cron until the retention policy is final
- use a separate Supabase cron schedule for cleanup

## Subscription-Aware Retention Direction

Retention should become part of the billing/entitlement model, not only a maintenance task.

Suggested future policy shape:

| Data category | Free starter direction | Paid/Pro direction | Notes |
| --- | --- | --- | --- |
| Temporary OAuth/session data | delete quickly | delete quickly | not a paid feature |
| Rate-limit buckets | delete quickly | delete quickly | not a paid feature |
| Webhook/dedupe intake | short operational window | short operational window | dedupe needs are operational, not plan value |
| Automation events/runs | shorter visible history | longer visible history | can drive plan differentiation |
| Publishing automation runs | shorter history | longer history | relevant for audit and generated draft history |
| Generated assets | shorter retained history/quota | longer history/quota | storage and AI value should map to plan |
| Chat sessions | shorter retained history/quota | longer history/quota | user-visible AI history |
| Analytics history | shorter lookback | longer lookback | likely one of the clearest paid-plan differentiators |

Do not silently delete user-visible records solely because a workspace is Free until:
- pricing/plan copy exists
- workspace entitlement records exist
- the UI communicates retention limits
- legal/privacy copy matches the actual policy
- any downgrade grace period is defined

## Safe v1 Cleanup Targets

These are the tables that already have enough columns for retention-based cleanup and are low-risk compared to user-facing product data.

### 1. Temporary session state

#### `oauth_page_sessions`
- Purpose: temporary Meta page selection session state
- Current columns used for cleanup:
  - `expires_at`
  - `created_at`
- Proposed rule:
  - delete rows where `expires_at < now()`
- Suggested cadence:
  - hourly or daily

#### `rate_limit_buckets`
- Purpose: rate-limiter bucket state only
- Current columns used for cleanup:
  - `bucket_start`
  - `created_at`
  - `updated_at`
- Proposed rule:
  - delete rows older than the largest active limiter window plus buffer
- Suggested first retention:
  - `2 days`

### 2. Invite and token lifecycle data

#### `workspace_invites`
- Purpose: invite workflow state
- Current columns used for cleanup:
  - `status`
  - `expires_at`
  - `accepted_at`
  - `created_at`
- Proposed rule:
  - delete `expired` or `revoked` rows older than `30 days`
  - delete `accepted` rows older than `90 days`

### 3. Dedupe and webhook intake history

#### `webhook_events`
- Purpose: webhook dedupe/intake history
- Current columns used for cleanup:
  - `received_at`
- Proposed rule:
  - delete rows older than `30 days`

#### `processed_comments`
- Purpose: automation dedupe cache
- Current columns used for cleanup:
  - `created_at`
- Proposed rule:
  - delete rows older than `90 days`

### 4. Automation operational history

#### `automation_events`
- Purpose: event intake / processing history
- Current columns used for cleanup:
  - `status`
  - `created_at`
  - `processed_at`
- Proposed rule:
  - delete terminal rows older than `90 days`

#### `automation_logs`
- Purpose: legacy wizard automation logs
- Current columns used for cleanup:
  - `status`
  - `triggered_at`
- Proposed rule:
  - delete rows older than `90 days`

#### `automation_runs`
- Purpose: workflow execution history
- Current columns used for cleanup:
  - `status`
  - `started_at`
  - `finished_at`
  - `created_at`
- Proposed rule:
  - delete terminal rows older than `180 days`

#### `automation_node_runs`
- Purpose: node-by-node execution history
- Current columns used for cleanup:
  - `status`
  - `started_at`
  - `finished_at`
  - `created_at`
- Proposed rule:
  - delete terminal rows older than `90 days`

#### `automation_scheduled_executions`
- Purpose: delayed execution queue state
- Current columns used for cleanup:
  - `status`
  - `scheduled_for`
  - `executed_at`
  - `created_at`
- Proposed rule:
  - delete `completed` or `failed` rows older than `60 days`

#### `publishing_automation_runs`
- Purpose: publishing automation generation/audit history
- Current cleanup direction:
  - do not delete in safety-cleanup v1 unless only terminal/system-failed rows are targeted
  - include in tier-aware history retention after subscription policy exists
- Suggested future retention:
  - Free: shorter run history
  - Paid/Pro: longer run history

### 5. AI and generated asset history

#### `generated_assets`
- Purpose: generated content/image asset metadata
- Current columns used for cleanup:
  - `used_in_post_id`
  - `created_at`
- Proposed v1 rule:
  - delete orphaned rows where `used_in_post_id is null` and `created_at < now() - interval '90 days'`
- Important:
  - if a row is deleted, the matching storage object should also be removed when possible
  - this should be subscription-aware before enabling destructive cleanup
  - current table does not have `storage_path`, so v1 should not guess storage object paths

#### `chat_sessions`
- Purpose: AI assistant conversation history
- Current columns used for cleanup:
  - `updated_at`
- Proposed v1 rule:
  - do not auto-delete aggressively
  - optional future cleanup for sessions inactive for `180-365 days`
  - make final limits plan-aware once subscriptions exist

### 6. Analytics history

#### `analytics_snapshots`
- Purpose: dashboard trend snapshots
- Current columns used for cleanup:
  - `date`
  - `created_at`
- Proposed rule:
  - keep `365 days`
  - final value should be tied to plan limits

#### `account_analytics`
- Purpose: daily account-level history
- Current columns used for cleanup:
  - `date`
  - `created_at`
- Proposed rule:
  - keep `730 days`
  - final value should be tied to plan limits

#### `post_analytics`
- Purpose: published-post analytics
- Current columns used for cleanup:
  - `synced_at`
- Proposed v1 rule:
  - keep indefinitely unless volume becomes a problem
  - for Free workspaces, consider a shorter visible lookback only after pricing/plan policy is live

## Tables To Avoid Auto-Deleting In v1

These are core product records and should not be part of the first cleanup function.

- `workspaces`
- `workspace_members`
- `workspace_settings`
- `workspace_brand_profiles`
- `social_accounts`
- `posts`
- `published_posts`
- `comments`
- `conversations`
- `messages`

If these ever get retention rules later, they should be product-policy decisions, not silent maintenance cleanup.

## Schema Support Assessment

The current schema is sufficient for a first cleanup function with per-table retention rules.

Why:
- most candidate tables already include one or more of:
  - `expires_at`
  - `created_at`
  - `updated_at`
  - `processed_at`
  - `finished_at`
  - `executed_at`
  - `scheduled_for`
  - `status`

### Nice-to-have later

These are not blockers for v1, but would improve cleanup precision later.

- add `storage_path` to `generated_assets`
  - easier and safer matching between DB rows and storage objects
- add optional archival flags for user-visible history tables
  - e.g. `archived_at`, `retention_locked_until`, `deleted_at`
- add a retention config table only if policy needs to become admin-editable
- add workspace-level subscription/entitlement storage before enforcing plan-specific retention

## Proposed Function Design

Recommended future function:
- name: `cleanup-retention`
- auth:
  - internal only
  - same style as other internal maintenance jobs
- schedule:
  - separate from minutely scheduler
  - daily

Suggested execution order:
1. temp session and limiter cleanup
2. invites
3. webhook/dedupe caches
4. automation history
5. orphaned AI/generated assets
6. analytics history

Suggested response payload:
- `started_at`
- `duration_ms`
- counts deleted per table
- storage delete counts
- warnings/errors per step

## Storage Cleanup Notes

Tables alone are not enough for full cleanup when storage objects are involved.

Relevant buckets:
- `generated_assets`
- `brand_assets`
- `post_media`

v1 storage cleanup should be conservative:
- only delete storage objects for DB rows explicitly identified as orphaned
- skip delete if the object path cannot be derived safely
- log skipped assets for review rather than guessing

## UI / Policy Follow-up

If retention cleanup is implemented, the product should expose clear retention hints in the UI and legal docs.

Recommended follow-up surfaces:
- workspace settings or a future `Data & Privacy` section
- AI asset and assistant surfaces if generated content is auto-cleaned
- Privacy Policy
- Data Deletion page

Important:
- backend retention rules should be finalized first
- UI copy should reflect the actual live retention behavior, not planned behavior

## Recommended v1 Scope

Implement first as safety cleanup only:
- `oauth_page_sessions`
- `rate_limit_buckets`
- `workspace_invites`
- `webhook_events`
- `processed_comments`
- `automation_events`
- `automation_logs`
- `automation_node_runs`
- `automation_runs`
- `automation_scheduled_executions`

Implement with extra caution:
- `rate_limit_buckets`
  - confirm cleanup can run through service role or add a security-definer cleanup RPC
- `automation_runs` / `automation_node_runs`
  - safe for old terminal rows, but these may become plan-visible history later

Do not include in destructive v1 until subscription/retention policy is final:
- orphaned `generated_assets`
- `chat_sessions`
- `analytics_snapshots`
- `account_analytics`
- `post_analytics`
- `publishing_automation_runs`

Defer to v2:
- `chat_sessions`
- `analytics_snapshots`
- `account_analytics`
- any user-visible communication or post history
- tier-aware generated asset and automation/publishing run history

## Open Questions Before Execution

1. Exact retention windows to commit to in product/legal copy
2. Whether orphaned generated assets should be kept `30`, `60`, or `90` days
3. Whether analytics history should be capped for all workspaces or only free-tier workspaces
4. Whether storage-object cleanup should be included in v1 or staged into v1.1
5. What Free vs Paid/Pro retention windows should be exposed in pricing and workspace settings
6. Whether downgrade grace periods are required before shortening retained history
7. Whether `publishing_automation_runs` should count as billing-visible history, operational logs, or both
