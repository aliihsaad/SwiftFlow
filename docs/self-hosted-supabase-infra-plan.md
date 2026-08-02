# Self-Hosting Supabase Itself: Infra Migration Plan

Last updated: 2026-07-24

## Decision

Self-host Supabase's own open-source stack rather than rebuild the
database/auth/storage/realtime/edge-function layer on different tools. This
keeps the app's Postgres schema, RLS policies, `@supabase/supabase-js`
client code, and all 23 Deno edge functions essentially untouched — this
becomes an infrastructure/deployment change, not a code rewrite.

## What "self-hosted Supabase" actually is

Supabase publishes an official Docker Compose stack (`supabase/supabase` repo,
`docker/` folder) with ~11 containers behind a Kong API gateway:

| Service | Role | Maps to in this repo |
|---|---|---|
| Postgres | The database | `supabase/migrations/*`, `supabase/schema.sql` |
| GoTrue | Auth | `utils/supabase/server.ts`, `utils/supabase/client.ts`, sign-in/sign-up routes |
| PostgREST | Auto REST API over Postgres | underlies `supabase-js` queries |
| Realtime | Postgres Changes + Broadcast | `app/api/webhooks/instagram/route.ts` broadcast, `app/dashboard/messages/page.tsx` |
| Storage API | File storage | `app/api/media/upload/route.ts`, `app/api/brand-profile/assets/route.ts`, `scripts/backfill-storage-objects.mjs` |
| imgproxy | Image transforms for Storage | supports Storage image resizing |
| Edge Functions runtime | Deno function execution | `supabase/functions/*` (all 23 functions) |
| Studio | Web dashboard for the above | admin/debugging UI, replaces the Supabase Cloud dashboard |
| Kong | API gateway/router | fronts everything at one URL |
| Analytics (Logflare) | Log aggregation | optional, can be stripped to save resources |

Minimum spec per Supabase's own docs: 4 GB RAM / 2 CPU cores to run it at all,
8 GB / 4 cores recommended for anything beyond toy usage. Worth being upfront
about this in self-host docs — "anyone can run this" realistically means "on
a small VPS," not a Raspberry Pi.

## Piece by piece

### Database + migrations — low risk

`supabase/migrations/*` and RLS policies run against any Postgres, including
the self-hosted one. The Supabase CLI can target a self-hosted instance with
`--db-url` instead of `supabase link`, so `supabase db push` still works
unchanged. Nothing in the schema is Supabase-Cloud-specific.

One change: self-hosted setup generates its own `JWT_SECRET`, `ANON_KEY`,
`SERVICE_ROLE_KEY`, and Postgres password via the stack's `generate-keys.sh`
script, instead of copying them from the Supabase Cloud dashboard. Those
become the values for `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` in this app's `.env`.

### Edge Functions — the real risk

This is the one piece Supabase itself still labels **beta** for self-hosting,
with "breaking changes to APIs/configuration options" explicitly called out
in their docs. That matters here because the automation engine (comment-to-DM,
canvas workers, AI generation) lives entirely in these 23 functions.

Mechanically it does map cleanly: the self-hosted Edge Runtime container
picks up functions by mounting a volume at `/home/deno/functions/<name>` —
which is exactly the `supabase/functions/<name>/index.ts` layout already in
this repo. No code restructuring needed, just a different deployment
mechanism (volume mount + container restart, instead of `supabase functions
deploy`).

Two things that need to be verified per-function during a pilot migration,
not assumed:

1. **`--no-verify-jwt`**: the README's current deploy instructions rely on this
   CLI flag for the `automation-worker-*` functions (internal-only, invoked
   by `automation-orchestrator`). Self-hosted, JWT verification is controlled
   through Kong's route config (`verify_jwt` per function) rather than a CLI
   flag at deploy time — needs to be set correctly in the Kong config file, or
   those workers will start failing with `401 Invalid JWT` exactly like the
   README already warns about for the cloud case.
2. **Shared imports**: functions import from `supabase/functions/_shared/*`
   (e.g. `ai-config.ts`). Confirm the self-hosted Edge Runtime resolves
   relative imports the same way the cloud one does — this is standard Deno
   behavior and should be fine, but it's cheap to smoke-test one function
   (`generate-caption` is a good low-stakes pick) before migrating the rest.

### Cron jobs — skip Supabase's cron entirely, use what's already built

Self-hosted Supabase doesn't get the cloud dashboard's "Cron" UI. To schedule
anything you'd normally hand-write `pg_cron` + `pg_net` SQL — and self-hosted
users specifically get tripped up because `pg_net` calls from inside the
Postgres container can't use `localhost`/`127.0.0.1` to reach the functions
container; it needs Docker's internal service DNS name instead.

Good news: this repo already has a cleaner path that sidesteps all of that —
`app/api/cron/scheduler/route.ts`. It's a plain Next.js route, protected by
`CRON_SECRET`, that fans out to `process-scheduled-posts`,
`process-scheduled-executions`, and `process-publishing-automations`. There's
also a `scheduler-tick` edge function doing overlapping work, seemingly built
for Supabase Cloud's native scheduled-function feature — worth deciding
whether to keep both or consolidate on one, since running both would
double-fire jobs.

Recommendation for self-hosting: standardize on `/api/cron/scheduler` and
trigger it with a plain OS-level cron entry or a one-line sidecar container
(`alpine + curl`, or `docker run --rm curlimages/curl` on a schedule) hitting
`curl -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/scheduler`
every minute. This is portable to any host (VPS, Docker, Kubernetes CronJob,
even Supabase Cloud if someone doesn't self-host), avoids the `pg_net`
Docker-networking gotcha entirely, and reuses code that's already written and
already auth-protected. Retire or clearly mark `scheduler-tick` as
Cloud-only/legacy to avoid confusion and double execution.

### Storage, Realtime, Auth — mostly default-compatible

- **Storage**: self-hosted Storage API defaults to local disk, or can point at
  S3/R2/MinIO if a self-hoster wants object storage instead. Either way,
  `app/api/media/upload/route.ts` and friends should work unchanged since
  they go through `supabase-js`'s storage client, not a Cloud-specific API.
  `imgproxy` is included in the compose stack for on-the-fly image transforms.
- **Realtime**: included as a container; the self-hosted Postgres image ships
  with logical replication already enabled (`wal_level=logical`), which is
  the one config Realtime actually needs. The webhook route's
  `supabase.channel(...).send(...)` broadcast pattern and the messages page's
  subscription should work as-is.
- **Auth**: GoTrue handles email/password and OAuth the same way; sign-in,
  sign-up, and password-recovery routes shouldn't need changes. Email
  delivery (invites, password reset) still needs an SMTP/Resend config either
  way — that's already externalized in this app via `RESEND_API_KEY`.

## Deployment ergonomics — matters for "anyone can use this"

Raw `docker compose up -d` with hand-edited `.env` secrets is a reasonable
bar for a technical self-hoster, but it's not "anyone." Two ways to lower
that further, worth deciding on later rather than blocking the plan:

- Ship a single top-level `docker-compose.yml` for this repo that bundles the
  Supabase stack *and* the Next.js app *and* the cron sidecar as one
  `docker compose up`, instead of asking people to stand up Supabase
  separately and then configure this app to point at it.
- Publish templates for one-click PaaS-style self-host tools that already
  have Supabase service templates (Coolify, Dokploy, etc.) — these exist
  specifically to make "self-host a Supabase-based app" approachable for
  non-infra people.

## Suggested pilot sequence

1. Stand up the official self-hosted Supabase Docker Compose stack alone
   first (no app changes yet) and confirm Studio loads, Auth signup works,
   and a test row round-trips through PostgREST.
2. Point this app's `.env` at the self-hosted instance's URL/keys, run
   `supabase db push --db-url <self-hosted-connection-string>`, and confirm
   the app boots and normal CRUD (posts, workspaces) works.
3. Migrate one low-stakes edge function (`generate-caption`) to the
   self-hosted Functions volume and confirm it runs end-to-end, including its
   `_shared` imports.
4. Migrate the automation-worker functions and specifically verify the
   `verify_jwt` / Kong routing behavior — this is the one place most likely
   to silently break the automation engine.
5. Wire up `/api/cron/scheduler` via OS cron or a sidecar container; retire
   `scheduler-tick` or confirm it's not double-firing.
6. Load-test Realtime (webhook broadcast → dashboard message refresh) and
   Storage upload/serve before calling the migration done.

## Open risk to flag honestly

Self-hosted Edge Functions being officially "beta" is the one piece of this
plan that isn't a sure thing — everything else (Postgres, Auth, Storage,
Realtime, cron via the app's own route) is well-trodden. If the pilot in step
3–4 surfaces real instability, the fallback isn't "give up on self-hosting" —
it's running the Next.js app + self-hosted Postgres/Auth/Storage/Realtime
locally while keeping the 23 functions on Supabase Cloud's free tier (Cloud
edge functions have a generous free quota), which still gets a self-hoster to
"no shared multi-tenant infrastructure, my own Meta app, my own data" without
depending on the beta runtime. Worth deciding after the pilot, not before.

## Sources

- [Self-Hosting with Docker - Supabase Docs](https://supabase.com/docs/guides/self-hosting/docker)
- [Self-Hosted Functions - Supabase Docs](https://supabase.com/docs/guides/self-hosting/self-hosted-functions)
- [Self-Hosted Deployment - DeepWiki](https://deepwiki.com/supabase/supabase/3-self-hosted-deployment)
- [Scheduling Edge Functions - Supabase Docs](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase cron jobs: pg_cron, scheduled Edge Functions, and external triggers (2026)](https://crontap.com/guides/supabase-cron-jobs)
- This repo: `app/api/cron/scheduler/route.ts`, `supabase/functions/scheduler-tick/index.ts`, `vercel.json`, `scripts/validate-env.mjs`
