# SwiftFlow Automation-First Managed Supabase Roadmap

**Status:** Active and approved
**Last updated:** 2026-07-28
**Target:** Stable automation-first v1 with a premium-grade product experience
**Standard deployment:** Vercel + a user-owned managed Supabase project
**Estimated remaining duration:** 1-3 weeks to a limited beta; 4-7 weeks to stable v1
**Canonical project name:** `Social-Media-Manager-AI-Tool` (product name: SwiftFlow)

## 1. Decision

SwiftFlow will keep Supabase as its standard backend for v1.

The supported deployment model is:

- the Next.js application runs on Vercel;
- each operator creates and owns a managed Supabase project;
- Supabase provides PostgreSQL, Auth, Storage, Realtime, Edge Functions,
  Queues, and Cron;
- each operator provides their own Meta app credentials;
- AI and other provider credentials remain bring-your-own where applicable;
- no VPS is required for the standard installation.

SwiftFlow should be described as an open-source, deploy-your-own application
with a bring-your-own Supabase backend. It must not be described as a fully
self-hosted backend while the standard path depends on managed Supabase.

A fully self-hosted Docker backend remains a possible advanced edition after
stable v1. It is not on the v1 critical path.

## 2. Why the roadmap changed

The application is already built around Supabase:

- workspace-scoped PostgreSQL data and RLS;
- authentication and session handling;
- storage and generated assets;
- Realtime behavior;
- 23 repository-owned Edge Functions;
- existing migrations, client utilities, and deployment conventions.

Removing Supabase would require replacing several working subsystems before it
improves the user-visible product. Keeping managed Supabase removes that
migration risk and lets the transformation focus on SwiftFlow's actual product
value: reliable automations, low-friction Meta onboarding, observability, and a
premium interface.

The provider-neutral automation work already completed is retained. Its durable
inbox/outbox contracts, idempotency, safety gates, rate budgets, circuit
breakers, auditability, and adapter boundaries improve reliability and preserve
a future portability option. They are no longer evidence that Supabase must be
removed.

## 3. Target architecture

```text
Browser
  -> Vercel-hosted Next.js application
      -> Supabase Auth
      -> Supabase Postgres + RLS
      -> Supabase Storage
      -> Supabase Realtime

Meta
  -> public HTTPS webhook
      -> signature verification
      -> durable event insert in Supabase Postgres
      -> Supabase Queue
      -> bounded Edge Function consumer
      -> durable automation outbox
      -> safety gates and provider adapter
      -> Meta Graph API

Supabase Cron
  -> queue recovery, scheduled automations, token health, and maintenance
```

The webhook must acknowledge quickly after durable persistence. Provider calls
must not be performed in the webhook request. Queue delivery and the outbox
remain responsible for retries, duplicate prevention, crash recovery, and
dead-letter handling.

Long-running work must be split into bounded jobs that fit hosted Edge Function
limits. Cron is a recovery and scheduling mechanism, not a substitute for
idempotency.

## 4. Deployment contract

### 4.1 Initial setup

The operator creates:

1. a Vercel project connected to the SwiftFlow repository;
2. a managed Supabase project;
3. a Meta app using Instagram Login for the default path;
4. optional AI/provider accounts.

The setup guide provides an exact environment-variable checklist and separates
public browser variables from server-only credentials.

### 4.2 Vercel environment

The Vercel project receives the variables used by the Next.js application,
including:

- `NEXT_PUBLIC_SUPABASE_URL`;
- the Supabase publishable/anon key;
- the server-only Supabase service key;
- `NEXT_PUBLIC_APP_URL`;
- public Meta app identifiers;
- server-only Meta credentials used by Next.js;
- configured AI/provider credentials.

### 4.3 Supabase Function secrets

Custom secrets used inside Edge Functions must also be configured in Supabase.
They are not inherited from Vercel. This includes Meta or AI credentials used
directly by a function.

Secrets must be applied without committing them:

```bash
supabase secrets set --env-file .env.supabase
```

### 4.4 Repeatable backend deployment

The repository will expose an idempotent deployment command that performs:

1. environment and CLI preflight;
2. project-link verification;
3. database migration deployment;
4. Edge Function deployment;
5. function-secret presence checks without printing values;
6. Queue/Cron configuration verification;
7. post-deployment smoke checks.

The underlying operations are:

```bash
supabase db push
supabase functions deploy
```

The target developer experience is:

```bash
npm run deploy:supabase
```

Vercel may continue deploying the application through its Git integration. A
later release wrapper may coordinate both control planes, but the system must
never imply that Vercel environment variables automatically configure
Supabase Function secrets.

## 5. Product scope for stable v1

### Required

- email/password authentication and recovery;
- workspace isolation, membership, and RLS;
- Instagram Login Quick Start;
- optional advanced Facebook Login path;
- token encryption, refresh, expiry, and permission health;
- real Meta webhook verification and signed event ingestion;
- durable comment and message automation processing;
- deterministic versioned workflow execution;
- private reply, comment reply, and allowed DM actions;
- retries, idempotency, dead-letter handling, and operator recovery;
- scheduler and delay behavior through durable jobs;
- storage, Realtime updates, and audit history;
- environment validation and reproducible deployment;
- premium responsive UI for the critical automation journeys;
- accessibility, performance, security, and release-soak gates.

### Optional or guarded

- AI actions and assistant features;
- email actions;
- Developer API and MCP surfaces;
- Stripe/hosted billing scaffolding;
- arbitrary HTTP actions;
- advanced Facebook Page features.

### Deferred beyond stable v1

- removing Supabase;
- Better Auth migration;
- separate S3 storage migration;
- replacement Realtime transport;
- a mandatory always-on Node worker;
- full-application Docker/VPS packaging;
- a fully self-hosted Supabase distribution;
- multi-provider backend portability certification.

## 6. Work already completed and retained

The following foundation remains valid:

- real Meta webhook verification and staging proof;
- durable inbox and automation outbox;
- deterministic provider event keys and duplicate suppression;
- controlled claims, retries, leases, and dead-letter states;
- least-privilege PostgreSQL role design;
- provider action safety gates, rate budgets, and circuit breakers;
- recording/simulation adapters and side-effect-free verification;
- direct Instagram Login onboarding;
- encrypted long-lived tokens and token health checks;
- automatic comments subscription with read-back;
- automation readiness checks and the Quick Start flow;
- the premium UI route inventory and transformation design work.

VPS staging artifacts remain useful test evidence, but VPS deployment is no
longer a product requirement.

## 7. Revised implementation phases

### Phase 0 - Roadmap correction and scope freeze

**Duration:** complete

- Make this document the source of truth.
- Mark the Supabase-exit roadmap and timeline as superseded.
- Remove Supabase replacement from stable-v1 acceptance criteria.
- Preserve completed reliability work.

### Phase 1 - Managed Supabase runtime alignment

**Duration:** 3-5 focused days

- Inventory every Edge Function and database migration used by active
  automation flows.
- Map the durable inbox/outbox and current executor contracts onto Supabase
  Queues, Cron, and bounded Edge Function consumers.
- Keep provider calls outside webhook requests.
- Ensure retries and crash recovery do not depend on an always-on VPS process.
- Confirm all jobs are idempotent and safe under overlapping invocations.
- Define queue latency, retry, and dead-letter operational expectations.

**Exit gate:** a real Meta event can be durably ingested, queued, matched,
executed through a disabled/recording adapter, and recovered after interruption
without a VPS.

### Phase 2 - Deployment productization

**Duration:** 2-4 focused days

- Add `deploy:supabase`, preflight, and smoke-check scripts.
- Document Vercel environment variables separately from Supabase Function
  secrets.
- Validate migrations and function deployment from a clean checkout.
- Verify Queue and Cron creation/configuration is migration-controlled.
- Add clear failure messages for missing keys, wrong project links, and stale
  migrations.
- Rehearse setup against a fresh managed Supabase project.

**Exit gate:** a new operator can deploy the backend without manual SQL or a
VPS and can verify every required backend capability.

### Phase 3 - Real automation vertical slice

**Duration:** 3-5 focused days

- Connect a fresh Instagram professional account through Quick Start.
- Verify callback, token, scopes, account identity, and `comments`
  subscription.
- Run a real comment-keyword automation from webhook to intended action.
- Prove duplicate delivery produces one durable event and at most one action.
- Prove expired/invalid credentials fail closed with a useful recovery state.
- Prove retryable provider errors recover and terminal errors dead-letter.
- Keep provider actions behind an explicit activation gate until all evidence
  passes.

**Exit gate:** a controlled real Meta automation succeeds end to end and has a
complete, non-secret audit trail.

### Phase 4 - Premium-grade UI completion

**Duration:** 5-10 focused days; may overlap Phases 1-3

- Finalize shared design tokens and accessible components.
- Approve three reference journeys before broad migration:
  1. Meta onboarding and connection health;
  2. automation builder and activation;
  3. run inspector and recovery.
- Migrate remaining priority routes in coherent batches.
- Provide polished loading, empty, success, warning, and failure states.
- Verify keyboard access, focus behavior, contrast, reduced motion, responsive
  layouts, and performance budgets.
- Keep advanced infrastructure detail behind progressive disclosure.

**Exit gate:** the critical journeys meet the premium visual, responsive, and
accessibility standard without weakening automation behavior.

### Phase 5 - Security, operations, and release hardening

**Duration:** 3-5 focused days

- Audit RLS and service-role boundaries across all workspace data.
- Confirm access and refresh tokens are never returned to the browser or logs.
- Add actionable health checks for webhook, Queue, Cron, functions, Storage,
  Realtime, Meta token, and provider status.
- Verify database backups and restore guidance for managed Supabase.
- Add secret-rotation and incident-response documentation.
- Establish error, latency, queue-depth, retry, and dead-letter visibility.
- Complete clean install, upgrade, rollback, and recovery rehearsals.

**Exit gate:** security and operational checklists pass with no critical or high
unresolved defects.

### Phase 6 - Release candidate and soak

**Duration:** minimum 7 calendar days

- Freeze features.
- Run real webhook and automation traffic.
- Monitor duplicates, queue latency, retries, provider failures, token expiry,
  and scheduled jobs.
- Fix all release-blocking defects and rerun affected gates.
- Publish the stable setup, upgrade, rollback, and troubleshooting guides.

**Exit gate:** seven consecutive days without a release-blocking defect.

## 8. Revised schedule and completion estimate

With one focused implementation stream and a feature freeze:

| Milestone | Estimate |
| --- | --- |
| Managed Supabase runtime and deployment path | 1-2 weeks |
| Limited usable automation-first beta | 1-3 weeks |
| Premium UI plus release hardening | 2-4 additional weeks |
| Stable v1 including mandatory soak | 4-7 weeks total |

Removing the Supabase migration from scope raises the estimated stable-v1
completion from roughly 45% to roughly 65%. This is an engineering estimate,
not a promise: Meta behavior, fresh-project deployment findings, and premium UI
scope are the main remaining sources of variance.

## 9. Stable-v1 release gates

Stable v1 is ready only when all of the following are true:

- no VPS is required for the standard deployment;
- a clean Vercel + managed Supabase setup is reproducible from documentation;
- migrations, Edge Functions, secrets checks, Queue, and Cron are deployable
  without manual database edits;
- authentication, RLS, storage, and Realtime work in a fresh project;
- a real Meta comment reaches the durable inbox and the correct automation;
- duplicate deliveries and repeated workers cannot duplicate provider actions;
- retry, dead-letter, and operator recovery paths are verified;
- secrets and tokens do not appear in client responses, source control, logs,
  or audit payloads;
- TypeScript, production build, tests, and lint error gates pass;
- the onboarding, automation builder, and run inspector meet the approved
  premium UI and accessibility standard;
- backup/restore, upgrade/rollback, monitoring, and incident guidance exist;
- the seven-day release soak passes.

## 10. Immediate next implementation step

Start Phase 1 with a managed-Supabase automation runtime audit:

1. classify all current Edge Functions as retained, consolidated, or legacy;
2. trace the real comment-to-private-reply path from webhook to action;
3. identify every place that currently assumes the staging VPS executor;
4. specify the Supabase Queue, Cron, and bounded consumer contract;
5. implement the smallest no-VPS recording-adapter vertical slice;
6. close the audit loop only after the resulting implementation tasks are
   recorded in this roadmap and the project memory.
