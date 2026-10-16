# Instagram DM restriction recovery

The recovery flow is implemented behind per-node configuration and is **not enabled in production**. Its automatic restriction classifier is intentionally closed: the verified Instagram restriction-signature registry is empty. The old WinDock logs discarded the original Meta error fields, and the operator does not have a captured API payload. An Instagram UI restriction notice does not establish an API code/subcode mapping.

Do not enable automatic classification using guessed codes. This is a rollout blocker, not a claim that the feature already recovers live failures.

## Existing architecture and integration

- `app/api/webhooks/instagram/route.ts` verifies and ingests comment/message events; `lib/webhooks/instagram-automation-events.ts` excludes echoes and normalizes sender/message identity.
- `automation-orchestrator` matches canvas triggers and queues `automation_runs` pinned to immutable workflow versions. Recovery uses the same run table and existing scheduler. It does not create another worker queue.
- `process-automations/graph-executor.ts` retains node checkpoints, the account/automation runtime budget, scheduled continuations, follower conditions, error branches, and statistics.
- `automation-worker-private-reply` retains the existing per-comment private-reply ledger. The normal public-reply worker publishes recovery replies. Recovery resource sends use the normal Send DM worker with a single combined message/resource request.
- `consume_instagram_recovery` atomically records the inbound receipt and queues the selected full verification journey. The existing stalled-run scheduler dispatches it (normally after its two-minute queued-run threshold and the next scheduler tick). No direct jump to the resource node is used.
- Existing campaign graph builders and campaign data are unchanged. The opt-in fields are in the workflow node inspector and validated by both dashboard and Developer API save paths.

## Error evidence and classification

`meta-messaging-error.ts` preserves bounded, sanitized `code`, `error_subcode` (as `subcode`), `type`, `message`, `fbtrace_id` (as `trace_id`), `is_transient` and HTTP status. Credentials and URLs are redacted. Raw response bodies are not stored.

The Graph API error envelope and general error categories are described in [Meta Graph API error handling](https://developers.facebook.com/docs/graph-api/guides/error-handling/) and [Messenger error handling](https://developers.facebook.com/documentation/business-messaging/messenger-platform/error-codes). General HTTP 429 / codes 4, 17, 32, 613 are separated as rate limits; HTTP 5xx / `is_transient` / codes 1, 2 as temporary; HTTP 401 / codes 102, 190 as authentication. **None of these enables the public fallback.**

No recipient-restriction signature is currently supported by verified Instagram evidence. In particular, broad codes 10, 200, 551, delivery-window errors, regional privacy-policy errors, recipient-unavailable errors, and unknown errors are not accepted as proof of recipient messaging settings. The existing private-reply ledger's `already_sent` outcome remains separate and cannot activate recovery.

To unlock classification:

1. Deploy the sanitized error capture with recovery still disabled, after deployment approval.
2. Inspect a naturally occurring rejected send in the execution timeline; correlate the provider trace, account, originating comment and manually confirmed conversation. Do not provoke repeated sends to restricted people to obtain a sample.
3. Verify the exact code/subcode/type/message against current **Instagram** API documentation or Meta support. A Messenger-only example is insufficient.
4. Add a narrow reviewed signature and an evidence citation to `VERIFIED_INSTAGRAM_RESTRICTIONS`, plus a sanitized regression fixture. The synthetic negative-number signature in the unit tests tests matching mechanics only; it is not a Meta code.
5. Replace the editor's pending-verification notice once evidence is accepted, and test in a consenting staging campaign before production opt-in.

### Research follow-up — 16 October 2026

The additional research supports the recovery approach, but does **not** establish an Instagram error signature that uniquely proves recipient privacy restrictions. The automatic classifier remains closed.

**Confirmed platform behavior.** Meta's [Instagram private-reply documentation](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/private-replies) describes addressing the first reply by comment ID, a single private reply within seven days, and follow-up messages only after the recipient responds, within 24 hours of that response. Its [official Instagram Postman collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-3a63181c-e5c6-4890-96dd-e4d425bef5e0) also requires user initiation for the ordinary Send API. A comment alone does not establish a normal DM conversation. These rules support routing a recovery keyword through the existing inbound pipeline; they do not guarantee acceptance of the resulting send.

**Confirmed privacy controls, without an API mapping.** Meta's [messaging-settings announcement](https://about.fb.com/news/2024/01/introducing-stricter-message-settings-for-teens-on-instagram-and-facebook/) describes limits on incoming contact and text-only message requests before acceptance. It does not identify a Graph API code/subcode for a campaign rejection, nor prove a particular button-template rejection. Do not infer a recipient's age, settings or reason for rejection from these policies.

**Firsthand observations, not authoritative classifications.** [InstantDM's published production observations](https://instantdm.com/instagram-api-error-codes-for-dm-automation) include `551/1545041` for unavailable recipients and `100/2534025` for ineligible private replies. Neither response identifies privacy settings uniquely. [Uplika's own incident records](https://uplika.com/en/docs/help) report `2534025` both across an account during a temporary block and for specific commenters. These observations reinforce keeping both signatures out of the restriction allowlist. They are not a basis for bypassing Meta policy or overriding retry behavior.

**Concrete local correction.** A [firsthand Instagram Login API report](https://stackoverflow.com/questions/78952684/instagram-send-message-api-returns-400-error) includes `100/2534014` with an unresolved-user response. This contradicts the existing shared private-reply helper's assumption that this subcode proves a previous delivery. Removed that numeric shortcut; a rejection no longer gets marked `sent` merely because its subcode is `2534014`. Existing explicit already-replied handling and successful-send reservations remain. Added tests for the observed response and a response with no message, plus exclusions for ambiguous recovery candidates. This does not reclassify or replay historical production claims; those need provider-side reconciliation before any repair.

The remaining evidence step is unchanged: deploy sanitized error capture with recovery disabled after approval, inspect a naturally occurring failure, then obtain Instagram-specific confirmation of its meaning. The operator does not need to supply an old payload. Several direct Meta error-reference pages could not be retrieved (HTTP 429 or unavailable); accessible official private-reply documentation and Meta's indexed documentation were used, without treating search snippets or vendor explanations as a verified restriction taxonomy.

Follow-up validation: **85 tests across five focused suites passed**, changed-file ESLint passed, and `npx tsc --noEmit` passed. The initial sandbox test attempt could not start because Windows denied Vitest temporary-file renames; the same tests passed outside that sandbox. No deployment, campaign change or live message was made.

## Durable state and safety

Migration: `supabase/migrations/20261017090000_instagram_dm_recovery.sql`.

| State | Scope and purpose |
| --- | --- |
| `instagram_dm_recoveries` | Unique workspace/account/entry campaign/comment; recipient, normalized keyword, pinned verification version, original run/node, rendered reply, sanitized rejection, expiry and recovery outcome. |
| `instagram_campaign_deliveries` | Atomic fallback claim per comment or resource claim per campaign/recipient; claim token, provider ID and send outcome. Normal confirmation and recovery share this ledger after the resource step opts in. |
| `instagram_recovery_receipts` | Unique workspace/account/message ID, with the routing decision; duplicate webhooks retain the original decision even after a run finishes. |

Tables use workspace read RLS and service-only mutations. No migration updates campaigns, turns on recovery, sends a message or backfills a queue. The stats RPC uses invoker security and RLS.

A fallback is eligible only after a confirmed rejection and a valid active verification journey on the same account. The entry campaign UUID is the campaign identity; the keyword is never the identity. Target validation requires an Instagram follower condition and explicitly guarded resource steps. Resource execution also checks the successful follower result from the actual run checkpoints.

The public template supports only `{username}` and `{keyword}`. Usernames are restricted to Instagram username characters. Keywords are a single ASCII word of 1–64 letters, digits, underscores or hyphens. Matching trims whitespace and folds case; it does not accept a keyword embedded in a sentence. Replies must fit the existing 220-character comment-action limit after substitution.

If an entry graph includes a public reply, recovery requires the explicit **allow one additional reply** option. This conservative check avoids assuming a missing checkpoint means that no public reply was sent. It authorizes one additional useful reply, not repeated replies. Meta may still reject it for permissions, deleted comments or platform restrictions.

Two active pending campaigns for the same recipient/account/keyword produce an `ambiguous` receipt and no campaign dispatch. Multiple originating comments within the same campaign resolve to the latest unexpired recovery. Different accounts and recipients do not share matches. Expired/completed records still consume matching keywords safely instead of falling through into unrelated keyword automations.

Repeated new keyword messages can retry the follower check after a completed non-follower journey. They do not create another run while that campaign/recipient has a queued, running or waiting recovery run. Replaying an old message ID never creates a new run. In-flight, failed and unknown resource reservations block another resource attempt. A confirmed already-delivered resource is skipped.

On first resource claim, historical successful DM events for the same configured verification resource node are conservatively treated as prior delivery. Review history before enabling an existing campaign, especially if resource node IDs changed or old events were deleted. Historic sends outside SwiftFlow cannot be inferred. Old opening-message success records may conservatively block a resource that needs manual review.

## Provider uncertainty and restrictions

There is no assumed Meta idempotency token for these sends. A database reservation cannot atomically commit with Meta's HTTP request. A crash after claiming but before sending can therefore leave an unsent message blocked; a crash after acceptance but before saving can leave a sent message unconfirmed. Both retain the reservation indefinitely and require provider-side reconciliation. Claims are never automatically reclaimed because they look old.

Only a definite rate-limit rejection releases a campaign claim and enters the existing delayed continuation path. Network failures, missing success IDs, 5xx responses and lost worker responses never release it. Public reply rejections and renewed resource restrictions are recorded without triggering another public-reply loop.

Guarded resource delivery combines the opening text and link/button in one provider call. It does not use the legacy two-request opening-text/CTA path, where opening-text success alone cannot prove resource delivery. It does not automatically downgrade a rejected button message to another send. Non-opted-in actions keep their previous behavior.

A user-initiated DM does not guarantee that Meta will accept a reply. No eligibility checks, privacy restrictions, send permissions, rate limits or messaging windows are bypassed. Recovery records default to 72 hours and allow 1–168 hours. Expiration is checked at inbound routing and again before resource delivery; the existing scheduler sweeps at most 500 expired records per tick.

## Observability

The established execution timeline includes `dm_restricted`, `fallback_reply_queued`, `fallback_reply_sent`, `fallback_reply_failed`, `recovery_dm_received`, `recovery_completed`, `recovery_expired` and `already_delivered_skipped`. Recovery transitions append events transactionally; provider errors, trace IDs, original run/node and recovery-run correlation are retained. Fallback provider errors are stored separately from the original DM error.

A successful fallback produces an `awaiting_recovery_dm` outcome and no ordinary node failure. The activity dialog displays this separately from a failed run, and updates its outcome when recovery completes or expires. It shows restricted-comment counts, public fallbacks, inbound recoveries, completed recoveries and expirations. Conversion is completed recovery records divided by restricted recovery records, **not unique people**; one delivered resource can complete several originating-comment records for the same campaign/recipient.

## Rollout

1. Keep all production campaigns unchanged while the Meta signature is unverified.
2. Review and apply the additive migration before deploying code that calls its RPCs. Keep the tables and delivery reservations across rollbacks.
3. Deploy the affected Edge functions: `automation-orchestrator`, `automation-worker-run`, `process-automations`, `process-scheduled-executions`, `automation-worker-private-reply`, `automation-worker-reply-comment`, and `automation-worker-send-dm`. Shared modules are bundled into the functions. Retain the existing internal authentication/verify-jwt deployment settings.
4. Deploy the Next.js application through the normal GitHub/Vercel workflow. No new secret or recurring job is required; the existing scheduled-execution tick must be healthy.
5. Capture and verify a real restriction signature, add its fixture, rerun checks, and deploy that classification change only after review.
6. Use a consenting test campaign to verify public reply permission, same-account sender identity, exact keyword routing, follower branches, resource acceptance and repeat-message suppression. No live messages were sent during implementation testing.
7. Enable only the approved campaign. Inspect timeline conversion, rejected sends and retained uncertain claims before expanding rollout.

## Enable WinDock after approval and signature verification

1. In **Windock followers check**, edit its resource Send DM step. Set **Resource delivery for campaign** to **WinDock** (entry ID `099cbfd8-df8d-430f-bebb-3d8278771a14`). Keep its existing WinDock resource URL and follower condition. Review historical delivery events before saving; preserve the existing resource node ID.
2. Ensure its non-follower branch tells the person to follow the account and DM **WinDock** again. Do not tell a recovered user to tap a button in the original private message: that message was rejected.
3. In **WinDock**, edit the entry Private Reply node. Enable DM restriction recovery, select **Windock followers check** (ID `bf9d3561-f7e5-4882-b2d8-0ceb9f156f85`), enter recovery keyword **WinDock**, choose validity, and preview the template.
4. Since WinDock also replies publicly, explicitly enable the one-additional-reply option if desired. Keep `{keyword}` in the template; no SKILL trigger or resource replacement is introduced.
5. Save and observe the next naturally occurring eligible restriction. Until a reviewed signature ships, the enabled setting alone still sends no fallback.

## Rollback

Disable recovery on the entry node to stop creating new recovery records. Existing records and pinned queued runs remain valid snapshots. To stop pending recovery delivery, pause the verification automation and cancel its pending recoveries/continuations through an audited maintenance action. Pausing cannot recall a request already in flight. Restore the prior application/function release if necessary, but do not drop the new tables, clear send claims, replay uncertain sends or erase receipts. Removing the resource guard while old recoveries remain pending forfeits shared delivery protection; drain/cancel and reconcile them first.

## Validation

Implementation checks passed: **674 tests across 88 regression files** (including the research corrections), **13 PostgreSQL integration tests**, the production build/TypeScript check, and Deno module checks. The full regression suite, production build and lint were rerun before the GitHub push. ESLint passed with zero errors and two pre-existing internal-navigation warnings in onboarding/settings components. The build also retains its existing Edge-runtime deprecation and Developer API pepper fallback notices.

Unit tests exercise strict classification, missing evidence, rate/auth/unknown exclusions, duplicate fallbacks, permission failures, crashes, failed persistence, interpolation, target scope, expiration and resource claims. Graph tests execute the real graph runner with controlled provider responses to verify follower gating and shared normal/recovery deduplication. PostgreSQL integration tests execute the actual migration/RPCs in an isolated local database, including 100 competing fallback claims, 50 resource claims, duplicate/repeated inbound messages, ambiguity and service-role permissions.

Commands:

```powershell
npm run test:ci
npx tsc --noEmit
npm run lint -- --ignore-pattern 'tasks/**'
npm run build
# SWIFTFLOW_TEST_DATABASE_URL must name an isolated localhost test database.
npx vitest run --config vitest.postgres.config.ts tests/integration/dm-recovery-postgres.integration.test.ts
deno check --no-lock supabase/functions/_shared/dm-recovery-policy.ts supabase/functions/_shared/meta-messaging-error.ts supabase/functions/automation-worker-run/index.ts supabase/functions/automation-orchestrator/index.ts
```

Next.js type checks do not fully typecheck legacy `@ts-nocheck` Edge code. Deno verifies module loading, and runtime/SQL regression tests cover the new state transitions. Live Meta end-to-end recovery and the editor in an authenticated browser remain rollout checks; the missing restriction signature prevents a production recovery demonstration.

## Changed files

| Area | Files |
| --- | --- |
| Shared configuration and error normalization | `supabase/functions/_shared/dm-recovery-policy.ts`, `meta-messaging-error.ts`, `dm-recovery-runtime.ts` |
| Existing delivery and event helpers | `supabase/functions/_shared/private-reply-delivery.ts`, `automation-timeline.ts` |
| Existing execution paths | `supabase/functions/automation-orchestrator/index.ts`, `process-automations/graph-executor.ts`, `process-scheduled-executions/index.ts` |
| Existing provider actions | `supabase/functions/automation-worker-send-dm/index.ts`, `automation-worker-reply-comment/index.ts` |
| Database | `supabase/migrations/20261017090000_instagram_dm_recovery.sql` |
| Save validation | `app/api/automations/route.ts`, `app/api/automations/[id]/route.ts`, `lib/developer-api/automation-graph.ts` |
| Editor | `types/automation-graph.ts`, `components/automation/canvas/nodes/node-config-panel.tsx`, `dm-recovery-fields.tsx` |
| Activity and conversion | `app/api/automations/[id]/runs/route.ts`, `components/automation/automation-runs-dialog.tsx` |
| Tests | `tests/publishing-automations/dm-recovery.test.ts`, `dm-recovery-graph.test.ts`, `tests/integration/dm-recovery-postgres.integration.test.ts`, `tests/developer-api/private-reply-delivery.test.ts` |
| Documentation | `docs/instagram-dm-restriction-recovery.md`, `docs/README.md` |
