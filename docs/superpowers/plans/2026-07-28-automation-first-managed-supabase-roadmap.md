# SwiftFlow Automation-First Managed Supabase Roadmap

**Status:** Stable-v1 release lock

**Scope locked:** 2026-08-14

**Standard deployment:** Vercel + operator-owned managed Supabase
**Canonical project:** `Social-Media-Manager-AI-Tool`

## 1. Final product decision

SwiftFlow stable v1 is an Instagram-only engagement command center. It connects
one or more Instagram professional accounts to a workspace and provides posts
and comments, inbox operations, analytics, and durable visual automations.

The supported deployment is Vercel plus a managed Supabase project. No VPS is
required or supported. The exact feature boundary is authoritative in
[`stable-v1-feature-matrix.md`](../../transformation/stable-v1-feature-matrix.md).

## 2. Final architecture

```text
Browser
  -> Vercel-hosted Next.js application
      -> Supabase Auth
      -> Supabase Postgres + RLS
      -> Supabase Storage and Realtime

Instagram
  -> Vercel HTTPS webhook
      -> signature verification
      -> durable Supabase event storage
      -> bounded Edge Function execution
      -> versioned automation graph
      -> durable action state and provider safety gates
      -> Instagram Graph API / Telegram / configured AI provider

Supabase Cron (one-minute tick)
  -> delayed automation continuations
  -> recovery and retry work
  -> Instagram token refresh and health maintenance
```

Webhook requests acknowledge after validation and durable persistence. Provider
side effects are idempotent and performed outside the public webhook request.

## 3. Completed transformation

The stable-v1 baseline already includes:

- managed Supabase migrations, Edge Functions, secrets, and preflight tooling;
- Instagram Login onboarding and readiness verification;
- automatic Instagram token renewal and reconnect fallback;
- live comment, DM, and story-reply ingestion;
- durable automation execution with retries, delays, error branches, and
  execution history;
- Instagram reply, private-reply, and DM actions;
- AI Response and Telegram notification/approval nodes;
- posts/comments, reel playback, inbox, and Instagram analytics;
- workspace roles, invitations, encrypted provider credentials, and scoped
  Developer API/MCP access;
- premium responsive application, authentication, settings, setup, and canvas
  interfaces;
- removal of Facebook, publishing/generation/scheduling, subscription, landing,
  and public-signup product surfaces.

## 4. Release-closure track

No feature phases remain for stable v1. Work is limited to the following release
gates, in order.

### Gate A — repository lock

- canonical feature matrix matches the shipped product;
- README and roadmap use the same Instagram-only deployment contract;
- pull requests run tests, lint, and a production build;
- all repository gates pass on the release candidate.

### Gate B — clean managed deployment

Using a fresh Vercel project and fresh Supabase project, follow the README
without manual database edits:

1. configure the documented variables and secrets;
2. deploy migrations and all required Edge Functions;
3. confirm scheduler/Cron configuration;
4. deploy the Vercel application;
5. run `npm run setup:check` with no failures;
6. create the owner account through the private setup flow.

### Gate C — production acceptance

On the release candidate:

1. connect an Instagram Business or Creator account and reach readiness 4/4;
2. receive and reply to a real comment from another account;
3. receive and reply to a real DM;
4. receive a real story reply when the connected account supports it;
5. verify fixed and AI replies, delay, condition, Telegram notification, and
   Telegram approval/rejection paths;
6. verify posts/reels, inbox, analytics, logout, recovery, and invitation flows;
7. verify duplicate webhook delivery does not duplicate provider actions;
8. verify execution history is complete and contains no credentials.

### Gate D — recovery and operations

- token refresh completes automatically and produces a reconnect state when it
  cannot recover;
- delayed/retry work resumes after a failed invocation;
- a dead-lettered action is visible to the operator and cannot silently resend;
- schema and data export procedures are exercised;
- rollback uses a previous Vercel deployment plus additive Supabase migrations;
- Vercel/Supabase logs and Telegram health alerts are documented and usable.

### Gate E — seven-day soak

After Gates A-D pass, deploy one unchanged release candidate for seven
consecutive days. During the soak:

- no features or schema redesigns are merged;
- only release-blocking fixes restart the soak;
- authentication, webhook ingestion, automations, token refresh, Cron, inbox,
  and analytics are checked daily;
- no unexplained duplicate action, credential exposure, data loss, or sustained
  execution backlog is accepted.

After the soak passes, create the stable-v1 tag and release notes.

## 5. Release blocker policy

A change may enter the locked release only when it fixes at least one of:

- a security or credential-handling defect;
- authentication, setup, deployment, or tenant-isolation failure;
- data loss or duplicate provider actions;
- a broken supported Instagram trigger/action;
- a broken token refresh, retry, dead-letter, or scheduler path;
- a production-breaking UI regression in a supported journey.

Everything else belongs to the post-v1 backlog.
