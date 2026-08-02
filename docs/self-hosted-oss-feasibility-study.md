# Self-Hosted, Open-Source, Bring-Your-Own-Meta-App: Feasibility Study

Last updated: 2026-07-24

## Question being answered

Can SwiftFlow become a self-hosted, open-source project where each person creates
their own Meta developer app (no Meta App Review), connects their own
Instagram/Facebook test accounts, and gets full functionality — especially
automations (comment-to-DM, comment replies, webhooks) and the Developer
API/MCP layer with full permissions?

**Short answer: yes, this is realistic, and the codebase is already closer to
this model than expected.** The main blocker isn't code — it's understanding
exactly where Meta's "no review needed" boundary sits, and being honest with
self-hosters about what that boundary means for multi-account/agency use and
for DM automation specifically.

## The Meta rule that makes this work

Meta's own App Review documentation (Instagram Platform docs, "App Review for
Instagram API") states the deciding factor plainly:

| Scenario | Login type | Access level | App Review |
|---|---|---|---|
| App is only for a business I own or manage | Instagram Login or no login | Standard Access | **Not required** |
| App is only for a business I own or manage | Facebook Login or no login | Standard Access | **Not required** |
| App is a "Tech Provider" serving multiple *other* businesses | Instagram Login | Advanced Access | **Required** |
| App is a "Tech Provider" serving multiple *other* businesses | Facebook Login | Advanced Access | **Required** |

Standard Access is scoped to **accounts that have a role on the Meta app**
(Admin, Developer, or Instagram/Facebook Tester). Any permission — including
`instagram_manage_comments`, `instagram_manage_messages`,
`instagram_business_manage_comments`, `instagram_business_manage_messages`,
`pages_messaging` — is usable at Standard Access with zero App Review, zero
Business Verification, and zero screencast, as long as the only accounts
touched are ones added as a tester/admin on that specific Meta app. Webhooks
also fire normally in Development Mode for those same accounts (confirmed
against `docs/instagram-webhooks-development-guide.md` in this repo, and still
accurate per current Meta docs).

This is exactly the shape of "self-hosted instance, one Meta app per
deployment, owner adds their own accounts (and maybe a few teammates/clients)
as testers." It's the same pattern Chatwoot (a comparable open-source,
self-hosted product) documents for its own self-hosted Instagram integration.

**The boundary that matters:** the moment a single deployment starts managing
Instagram/Facebook accounts belonging to *unrelated* businesses that aren't
added as testers on that app (i.e. an actual multi-tenant SaaS on a shared
Meta app), it becomes "Tech Provider" territory and needs Advanced Access +
App Review + Business Verification. That's the exact situation the current
hosted SwiftFlow product is already in — hence all the `docs/app-review/*`
and `docs/meta-app-review-master-plan/*` work already in this repo. Self-hosting
sidesteps that entirely because each instance's Meta app only ever serves its
own owner's (and testers') accounts.

## What this means for automations specifically

The automation engine (comment-to-DM, comment auto-reply, webhook triggers)
needs `instagram_manage_comments` and `instagram_manage_messages` (or their
`instagram_business_*` equivalents on the Instagram Login path). Both are
fully usable at Standard Access for tester accounts — nothing in the
automation code path is gated behind Advanced Access. Per the current
`docs/meta-permission-matrix.md` in this repo, the only real code gap is that
`pages_messaging` isn't currently requested by `utils/meta-oauth.ts`, which
`supabase/functions/sync-messages/index.ts` expects for the Page-conversations
messaging endpoint — that's a real bug to fix regardless of the self-hosting
question.

**Independent of App Review, Meta *policy* constraints on messaging still
apply and can't be engineered around.** There are two different windows,
easy to conflate, that matter for two different SwiftFlow automations:

- **Comment → DM (Private Reply)**: this is what the comment-to-DM automation
  actually uses (`POST /<ig-id>/messages` with `recipient.comment_id`). Per
  Meta's own Private Replies docs, it can be sent up to **7 days** after the
  comment was made — more room than the 24-hour figure this doc originally
  said. The hard limits instead are: **only one message per comment**, and if
  the commenter never replies to that private reply, no further automated
  message can ever be sent to them off the back of that comment. A follow-up
  is only allowed **if the recipient responds**, and then must go out within
  24 hours of their response.
- **Regular DM auto-reply** (user DMs the business first, unrelated to any
  comment): governed by the standard 24-hour window from the user's last
  message. `human_agent` can extend a real human's reply to 7 days, but Meta
  explicitly detects and blocks bots from using that tag — it's not a lever
  the automation engine can use.

Practical failure mode for this codebase: the canvas automation builder has a
delay/wait node (`process-scheduled-executions` resumes delayed nodes). A
flow like "comment → wait 8 days → send DM" will get rejected by Meta's API
at send time — not because of App Review or self-hosting, but because the
7-day private-reply window already closed. Same for "send a second DM to a
commenter who never replied" — the API will reject it regardless of delay
length, since only one private reply is allowed per comment at all. This
should be a UI-level constraint (cap the delay node at under 7 days for
comment-triggered flows, and disable/warn on multi-message-per-comment DM
steps) rather than something users discover as a runtime error.

### Decisions on the two mitigations discussed

**Delay node cap — adopt.** Cap comment-triggered delay nodes at 6 days
(1-day safety buffer under Meta's 7-day private-reply limit). Enforce it in
both the canvas UI (`components/automation/canvas/nodes/node-config-panel.tsx`)
and server-side in `process-scheduled-executions`, since the UI cap alone
doesn't stop someone hand-editing a workflow JSON or an old automation
surviving a config change.

**CTA button to encourage a reply — partially already built, but wired to
the wrong message.** `automation-worker-send-dm` already supports a button
template (`recipient: { id }`, `attachment.type: template`), but that path
requires the messaging window to already be open — it's used for the
follow-up/link message, not the first touch. The actual first message to a
fresh commenter goes through `automation-worker-private-reply`
(`recipient: { comment_id }`), which today only sends plain text — no
button attachment. Two open items before calling this "done": (1) confirm
whether Meta's `comment_id`-recipient endpoint even accepts a button/template
attachment at all (Meta's own Private Replies doc only shows a text
`message`, so this needs an actual test call, not an assumption), and (2) if
it does, wire `button_text`/`link_url` into the private-reply worker too. If
it doesn't, the fallback is a well-written plain-text nudge ("Reply YES and
I'll send the link!") — still legitimate and still helps open the follow-up
window, just not a tappable button.

**Better than a button anyway: the plain-text "reply SEND" pattern most
comment-automation tools already use.** The private reply asks for a
specific reply keyword ("Reply SEND and I'll get you the link 🎁") instead of
a tappable button. The infrastructure for the second half of this loop
already exists in this repo: `trigger_new_message` is a real node type
(`types/automation-graph.ts`, exposed via the node catalog) that supports a
`keywords` filter, and the Instagram webhook handler already calls
`handleMessageAutomationTrigger` on every incoming DM (`app/api/webhooks/instagram/route.ts`).
So the full compliant loop is buildable today with existing node types: comment
→ `action_private_reply` with a reply-keyword CTA → user replies "SEND" →
`trigger_new_message` (keyword match) fires within the now-open 24-hour
window → deliver the actual promised content. No button-attachment support
needs to be confirmed at all for this to work. Worth turning into a
one-click template in the automation template picker, with the CTA copy and
matching keyword pre-filled and kept in sync so they can't drift apart.

**Human Agent tag via a "delay + human-like AI answers" trick — not doing
this.** Meta's policy is explicit that `human_agent` only covers messages an
actual human sends, and their detection is built to catch automated use of
it regardless of how convincingly the output reads or how naturalistic the
timing looks — this isn't a content-similarity filter to out-write, it's
built around behavioral/account-level signals. If it gets caught, the
consequence isn't "this one permission gets revoked" — it can mean the
Instagram/Facebook account or the whole Meta app gets restricted, which
breaks every automation for that self-hoster, not just delayed DMs. That
risk is a bad trade against a feature that only covers the edge case of
messaging someone after the window already closed.

The compliant version of the same idea still gets most of the value: build a
"stale conversation" queue in the dashboard for messages outside the 24-hour/
7-day windows, let the AI draft a suggested reply the same way it already
does for comment replies, and require a real person in the workspace to
review and click Send. That message is genuinely human-sent (satisfies
`human_agent`), the AI just removes the blank-page problem — same UX payoff
as an automated send, none of the platform risk. This should be surfaced in the UI, not just docs.

Development Mode / Standard Access also runs on lower rate limits than Live
Mode (roughly 200 calls/hour per Instagram account is the commonly cited
Graph API baseline). Fine for one person or a small team's own accounts;
not fine for someone trying to quietly run a multi-client agency off one
Meta app's tester slots.

## Two Instagram connection paths — worth deciding explicitly

Meta currently supports two separate, non-combinable login products:

- **Instagram API with Facebook Login** (what this repo uses today — scopes
  `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`,
  `pages_*`). Requires the user to have a Facebook Page linked to their
  Instagram Business/Creator account. More setup friction, but needed anyway
  for the Facebook-side features (Page posting, Page analytics).
- **Instagram API with Instagram Login** (`instagram_business_basic`,
  `instagram_business_manage_comments`, `instagram_business_manage_messages`,
  `instagram_business_content_publishing`). No Facebook Page required at all
  — a self-hoster just logs in with Instagram directly. Lower friction, but
  Instagram-only (no Facebook Page publishing/analytics).

For a self-hosted OSS pivot aimed at "anyone can spin this up," the Instagram
Login path is the friendlier onboarding option for IG-only users, at the cost
of losing Facebook Page features on that account. This repo's dual
Instagram+Facebook feature set probably means keeping Facebook Login as the
default and treating Instagram Login as a lighter "IG only" mode — worth a
product decision, not just an engineering one.

## Good news: the "configurable per deployment" part is mostly already built

Ali's premise was "make the Meta app configurable per hosted project." Looking
at the actual code:

- `NEXT_PUBLIC_META_APP_ID`, `META_APP_SECRET`, and `META_WEBHOOK_VERIFY_TOKEN`
  are already plain environment variables (`utils/meta-oauth.ts`,
  `app/api/webhooks/instagram/route.ts`) — every self-hosted deployment
  already gets its own Meta app just by setting its own `.env`. No shared
  hardcoded app ID anywhere in the code.
- `utils/meta-oauth.ts` already has a scope-profile system
  (`META_OAUTH_SCOPE_PROFILE=full` vs `review_phase_1`) built specifically to
  narrow scopes for Meta's reviewer. Self-hosters just need to set it to
  `full` (already the non-default fallback in the code) to get the entire
  permission set, comments/messages included, with zero review-related
  gating in the UI. `META_OAUTH_INCLUDE_PAGES_MESSAGING=true` turns on the
  DM-related scope too.
- Historically the repo *used to* support per-workspace Meta app credentials
  (see `docs/instagram-webhooks-shared-meta-app-plan.md`), and was migrated
  *away* from that toward one shared app for the hosted SaaS product. That
  migration is actually compatible with self-hosting too — "one Meta app per
  deployment" via env vars is simpler to reason about than "one Meta app per
  workspace," and avoids the multi-tenant Advanced-Access trap described
  above.

So the core architecture doesn't need a rewrite. What's actually missing is:

1. **Self-host onboarding docs**: step-by-step "create a Meta app, add
   yourself/your team as Instagram/Facebook testers, get your App ID/Secret,
   set `META_OAUTH_SCOPE_PROFILE=full`" — this repo has zero of that today;
   all existing docs assume the hosted-SaaS-going-through-review path.
2. **A first-run setup flow** (optional but high-value): instead of hand-editing
   `.env`, a settings screen where a self-hoster pastes their Meta App
   ID/Secret and webhook verify token on first launch. `scripts/validate-env.mjs`
   already validates env vars at build time, so this would extend that pattern
   into a UI, not invent a new one.
3. **UI messaging about the 24-hour DM window** so self-hosters don't file bugs
   when a delayed automation silently fails a Meta policy check.
4. **License change**: `README.md` currently says "This project is private
   and proprietary" — that has to change to an actual OSS license before
   this can be distributed as open source.
5. **Decide what SaaS-only scaffolding to strip or gate**: Stripe billing
   (`BILLING_ENFORCEMENT_MODE`, already off by default — good), the hosted
   Developer API OAuth/MCP surface (`app/api/developer/*`), multi-workspace
   invites/RBAC (still useful for a self-hosted team, can stay). None of this
   blocks self-hosting; it's just extra surface area to document as
   optional.

## The MCP / Developer API "full permissions" question

This part isn't a Meta question at all — `app/api/developer/mcp/route.ts` and
`lib/developer-api/scopes.ts` are entirely internal to SwiftFlow's own code.
Developer API scopes (`posts:*`, `automations:*`, `analytics:read`,
`brand:*`, `media:*`) are just an app-level permission list a workspace
owner/admin assigns to their own API keys — there's no external approval
gate on any of it. A self-hoster already has full control: they can grant
every scope to their own key today, in the existing hosted product, let alone
a self-hosted one. Nothing to "unlock" here beyond maybe adding a "grant all
scopes" convenience toggle in the key-creation UI.

## Bottom line

| Question | Answer |
|---|---|
| Can a self-hoster create their own Meta app and skip App Review entirely? | Yes, for accounts they own/manage and add as testers — this is Meta's documented "Standard Access, own business" path. |
| Do comment-to-DM and comment-reply automations work under that path? | Yes — `instagram_manage_comments`/`instagram_manage_messages` (or `instagram_business_*`) are usable at Standard Access. |
| Do webhooks fire in Development Mode? | Yes, for tester/admin accounts — already documented and working in this repo. |
| Any permission that truly requires App Review no matter what? | No specific permission is Advanced-Access-only forever — the requirement is about *whose* accounts you're touching, not the permission name itself. |
| Does DM automation work outside the 24-hour reply window? | No — that's a Meta messaging policy, not an App Review gate, and can't be configured around. |
| Is "MCP with full permissions" possible? | Yes, trivially — it's SwiftFlow's own internal scope system, no Meta involvement. |
| Does the codebase need a rearchitecture to support this? | No — env-based per-deployment Meta credentials and a `full` scope profile already exist. Mostly a docs/onboarding/UX + licensing effort, not a rewrite. |
| Where's the real limit? | A single self-hosted Meta app scales to "your own accounts + a handful of testers you personally add," not to running many unrelated clients' accounts through one shared app — that tips back into Advanced Access/App Review territory. |

## Suggested next step

Treat this as a real workstream: write the self-host setup guide (Meta app
creation + testers + env vars), add the DM-window UI warning, flip the
license, and decide the Facebook-Login-vs-Instagram-Login product question.
None of it requires touching the core data model or automation engine.

## Sources

- [App Review - Instagram Platform - Meta for Developers](https://developers.facebook.com/docs/instagram-platform/app-review/)
- [Overview of the Instagram API - Meta for Developers](https://developers.facebook.com/docs/instagram-platform/overview/)
- [Instagram App Review - Chatwoot Developer Docs (self-hosted precedent)](https://developers.chatwoot.com/self-hosted/instagram-app-review)
- [Instagram Messaging API 24-Hour Window Policy: The Complete Guide (2026)](https://www.keyapi.ai/blog/instagram-messaging-api-policy/)
- [What is Human Agent tag in Instagram/Messenger channel - Chatwoot](https://www.chatwoot.com/hc/user-guide/articles/1745225158-what-is-human-agent-tag-in-instagram-messenger-channel)
- [Instagram API Advanced Access Approval Guide (2026)](https://singhamandeep.com/instagram-api-advanced-access-approval/)
- [Instagram Graph API Rate Limits Explained (2026)](https://singhamandeep.com/instagram-graph-api-rate-limits-why-your-app-hits-429-errors-and-how-to-scale-2026/)
- This repo: `docs/meta-permission-matrix.md`, `docs/meta-approved-permissions-opportunity-map.md`, `docs/instagram-webhooks-development-guide.md`, `docs/instagram-webhooks-shared-meta-app-plan.md`, `utils/meta-oauth.ts`, `lib/developer-api/scopes.ts`
