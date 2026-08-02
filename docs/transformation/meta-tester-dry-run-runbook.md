# Meta tester dry-run runbook

Goal: deliver one real Instagram comment webhook to the staging ingress, prove it
is signature-verified, stored once, claimed once, and compared against the
expected automation - without sending any Meta action.

**Nothing in this runbook enables a provider side effect.** The comparison worker
stays side-effect-free for its entire duration.

Callback URL: `https://webhooks.social.swiftdigital-s.com/webhooks/meta`

## Non-negotiable boundaries

- Use an **isolated Meta app**. Do not modify the production Meta app. Start it
  unpublished while configuring it; publish only after the callback, subscriptions,
  and zero-side-effect staging worker have been verified.
- Do not reuse production credentials anywhere in this flow.
- Subscribe to the `comments` field **only**.
- No public reply, private reply, or DM is sent at any point.
- `WEBHOOK_INBOX_SHADOW_ENABLED` stays **unset**. It is read only by the hosted
  Next.js route in `app/api/webhooks/instagram/route.ts`, which writes to
  Supabase. The Meta callback points at the VPS ingress instead, so the flag is
  irrelevant to this architecture and enabling it would write experimental rows
  into the production database.

## Phase A - Meta developer dashboard

Meta relabels this UI periodically; the sequence is stable even when wording
shifts. Where a label differs, the equivalent step is named.

1. **Create a new app.** developers.facebook.com → My Apps → Create App. Choose
   the use case that exposes **Instagram** (typically "Other" → "Business").
   Name it distinctly, e.g. `SwiftFlow Staging Webhooks`.
2. **Keep it unpublished during setup.** Meta sends dashboard test webhooks while
   the app is unpublished, but the current dashboard explicitly blocks all real
   Instagram data in that state - including data from admins, developers, and
   testers. Phase F publishes only after every staging safety check passes.
3. **Add the Instagram product**, then open **API setup with Instagram login**
   (not the Facebook Login path - this deployment defaults to Instagram Login).
4. **Record the Instagram app ID and Instagram app secret.** The secret is
   revealed behind a password prompt. These Instagram Login product credentials
   are distinct from the general Meta App ID and App Secret in Settings → Basic.
   Do not paste either secret into chat, a file in this repository, or a shell
   command. Phase B covers how to install them.
5. **Add the Instagram tester.** In the Instagram product's roles/tester section,
   invite the Instagram **professional** account (Business or Creator - a
   personal account will not work).
6. **Accept the invitation** from the Instagram side: log in as that account at
   instagram.com → Settings → Apps and websites → Tester invites → Accept.
   The invitation is not active until accepted.
7. **Configure webhooks.** In the Instagram product's webhooks section set:
   - Callback URL: `https://webhooks.social.swiftdigital-s.com/webhooks/meta`
   - Verify token: the value installed in Phase B
   Do **not** subscribe any field yet. Phase C verifies the handshake first.

### Permissions required

For comment webhooks under Instagram Login:

- `instagram_business_basic`
- `instagram_business_manage_comments`

Publishing is required before Meta sends real comment webhooks. App roles/testers
can exercise permissions that have standard access; App Review/advanced access is
still required before onboarding general users. Verify the Publish page because
Meta can add account- or business-specific requirements.
`instagram_business_manage_messages` and `instagram_business_content_publish` are
**not** needed for this dry run and should not be requested.

## Phase B - Install the real secrets without exposing them

All three values live only in `/opt/swiftflow-staging/.env.worker.staging`, mode
0600 root-owned, untracked and never copied off the host.

Edit the file in place with an editor, which keeps the values out of shell
history and out of the process list:

```bash
ssh root@<vps> 'nano /opt/swiftflow-staging/.env.worker.staging'
```

Replace the values of exactly three lines, leaving every other line untouched:

- `INSTAGRAM_APP_SECRET=` → the Instagram Login product secret from Phase A
  step 4
- `META_APP_SECRET=` → the general Meta App Secret from Settings → Basic; keep
  it during validation so both dashboard and Instagram Login deliveries remain
  verifiable
- `META_WEBHOOK_VERIFY_TOKEN=` → a fresh random token you choose; generate one
  with `openssl rand -hex 32` on the host and paste it into both the file and
  the Meta dashboard

Do **not** use `sed -i "s/...$SECRET/"` or `echo`: the value would appear in
shell history and, briefly, in the process list.

Afterwards confirm the file is unchanged in shape and still private, then
recreate the ingress so it reads the new values:

```bash
stat -c '%a %U:%G %s' /opt/swiftflow-staging/.env.worker.staging
grep -c '=' /opt/swiftflow-staging/.env.worker.staging
```

Expect `600 root:root` and eight variables after upgrading an existing
seven-variable deployment. Then:

```bash
cd /opt/swiftflow-staging && docker compose --env-file .env.worker.staging -f compose.webhook-comparison.staging.yaml up -d --wait
```

Only the ingress recreates. The database and its volume are untouched.

## Phase C - Verify the handshake BEFORE subscribing

Run on the host so the token never leaves it:

```bash
cd /opt/swiftflow-staging && set -a && . ./.env.worker.staging && set +a && \
C="chal-$(date +%s)" && \
curl -s --get "https://webhooks.social.swiftdigital-s.com/webhooks/meta" \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=$META_WEBHOOK_VERIFY_TOKEN" \
  --data-urlencode "hub.challenge=$C" | grep -q "^$C$" && echo "handshake OK" || echo "handshake FAILED"
```

Then click **Verify and save** in the Meta dashboard. Meta performs the same GET.
If it fails, stop: the token in the file and the token in the dashboard differ.

## Phase D - Obtain a token and the Instagram user ID

Per-account webhook subscription requires a user access token. **This deployment
has no OAuth flow yet** - the Instagram Login adapter is later roadmap work - so
the token must be obtained manually, either from the Instagram product's token
generator in the dashboard or by completing the OAuth redirect by hand.

With the token, read the account identity:

```bash
curl -s "https://graph.instagram.com/v23.0/me?fields=id,username&access_token=<TOKEN>"
```

Record the returned `id`. That is the Instagram user ID Meta puts in
`entry[].id` on every webhook, and it is what the staging database must key on.

Treat the token as a secret: it is not needed after Phase D2 and should not be
stored in the repository.

## Phase E - Seed the staging database for the tester account

Without this the comparison worker resolves nothing and every real event is
recorded as `account_not_resolved`, which proves ingestion but not matching.

The matcher requires all of the following:

- a `social_accounts` row whose `account_id` equals the Instagram user ID from
  Phase D (or a `metadata` fallback: `ig_user_id`,
  `instagram_business_account_id`, `connected_page_id`, or `page_id`);
- an `automations` row for that account with `is_active = true`,
  `editor_version = 'canvas'`, and a non-null `workflow_graph`;
- inside the graph, a `trigger_new_comment` node whose keyword and post-scope
  config match the comment, an `action_private_reply` node with a `message`
  (or `use_ai_response: true`), and an edge path from the trigger to that action.

Instagram Login can return a `/me` user ID that differs from the account ID Meta
places in `entry[].id`. Key `social_accounts.account_id` to the observed
`entry[].id`, and preserve the `/me` ID in `metadata.ig_user_id`. The seed script
accepts both:

```bash
sh seed-tester-account.sh <WEBHOOK_ENTRY_ID> swiftflow <INSTAGRAM_LOGIN_ME_ID>
```

The seed uses a placeholder access token only - the ingress and comparison roles
are both forbidden from reading token columns, which the deployed verifiers
already prove.

## Phase F - First real comment in dry-run comparison mode

1. **Publish the isolated staging app.** On the Publish page, confirm all required
   app settings are complete, then publish. An unpublished app receives only
   dashboard test webhooks; a tester role does not bypass this gate.

2. Subscribe the account to the `comments` field only:

   ```bash
   curl -s -X POST "https://graph.instagram.com/v23.0/<IG_USER_ID>/subscribed_apps" \
     -d "subscribed_fields=comments" -d "access_token=<TOKEN>"
   ```

3. From a **different** Instagram account, comment on a post owned by the tester
   account, including the configured keyword. A comment authored by the connected
   account itself is deliberately ignored as `self_authored_comment`.

4. Confirm within the staging database that the event was signature-verified
   (it could not have been stored otherwise), stored exactly once, claimed once,
   and compared.

Expected terminal state: `status = succeeded`, `result.sideEffectsExecuted =
false`, and `result.matchedAutomationIds` containing the seeded automation.

### Payload shape - confirmed 2026-07-27

The risk that Instagram Login might omit `from` is **resolved**. A real delivery
from Meta's dashboard test button produced exactly the shape the parser needs:

```json
{
  "object": "instagram",
  "entry_id": "0",
  "entry_time": 1785108996,
  "transport": "changes",
  "change": {
    "field": "comments",
    "value": {
      "id": "17865799348089039",
      "text": "This is an example.",
      "from": { "id": "232323232", "username": "test", "self_ig_scoped_id": "232323232" },
      "media": { "id": "123123123", "media_product_type": "FEED" },
      "parent_id": "1231231234"
    }
  }
}
```

`value.id`, `value.media.id`, `value.from.id`, and `value.text` are all present,
so `parseCommentWebhookContext` resolves cleanly and no parser change is needed.
`from.self_ig_scoped_id` is additionally available and is a candidate signal for
self-loop protection later.

Meta's test payload carries `entry.id = "0"`, which matches no seeded account, so
it is correctly recorded as `account_not_resolved`. That is the expected outcome
for a test delivery and still proves the whole ingress path.

The deployment smoke fixture in `workers/webhook-ingress-smoke.ts` now mirrors
this complete shape. Its verifier proves signature acceptance, one stored row,
one claim, one matched automation, deduplicated replay, and zero side effects.

## Phase G - Duplicate delivery

Re-deliver the same event from the dashboard's webhook test tool, or let Meta
retry naturally. The provider event key is derived from the comment ID, so a
duplicate must not create a second row and must not produce a second comparison.

## What needs manual action

These cannot be automated from this repository and require the operator:

1. Creating the development-mode app and adding the Instagram product.
2. Inviting the Instagram professional account as a tester **and accepting the
   invite from the Instagram account itself**.
3. Revealing the app secret and installing it on the host (Phase B).
4. Choosing the verify token and entering it in the dashboard.
5. Obtaining a user access token - no OAuth flow exists in this deployment yet.
6. Publishing the isolated app after its safety checks pass.
7. Posting the triggering comment from a second Instagram account.

## Rollback

- Unsubscribe: `DELETE /{ig-user-id}/subscribed_apps`.
- Remove the callback URL in the dashboard, or delete the development app.
- Restore the staging placeholders in `.env.worker.staging` and recreate the
  ingress.
- Delete the seeded rows from the staging database.

None of these touch production, the Vercel app, Supabase, or any unrelated
service on the VPS.
