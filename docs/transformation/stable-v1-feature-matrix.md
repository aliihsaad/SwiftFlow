# SwiftFlow Stable-v1 Feature Matrix

**Status:** Active
**Updated:** 2026-07-28

This matrix prevents the infrastructure and UI transformations from silently
removing active product behavior.

## Classification

- **Default:** enabled in the standard Vercel + managed Supabase installation.
- **Optional:** retained and supported, but disabled until configured.
- **Guarded:** retained but unavailable until its correctness/security gate
  passes.
- **Decision pending:** retained for stable v1; packaging default is unresolved.
- **Not supported baseline:** visible legacy or placeholder behavior that is not
  considered a functioning capability.

## Matrix

| Capability | Stable-v1 classification | Current baseline | Transformation target |
| --- | --- | --- | --- |
| Password authentication and recovery | Default | Supabase Auth | Retain Supabase Auth and verify recovery/session flows |
| Workspace isolation and memberships | Default | Workspace-scoped schema and policies | Retain Supabase PostgreSQL and enforce audited RLS |
| Multi-workspace and team administration | Decision pending | Present | Retain; choose default or optional packaging |
| Instagram Login | Default | Direct onboarding implemented locally | Verify and productize the lowest-friction Meta connection path |
| Facebook Login and Page features | Optional | Existing advanced path | Preserve behind explicit advanced setup |
| Meta webhook receipt | Default | Next.js callback plus current persistence/functions | Signed durable inbox in Supabase Postgres plus queued bounded processing |
| Meta token and permission health | Default | Readiness checks and reconnect foundations implemented | Complete Account Health Center and operator recovery states |
| Graph-backed automation engine | Default | Canvas graph is authoritative | Versioned deterministic runtime using durable Postgres inbox/outbox and bounded queue consumers |
| Automation presets/templates | Default | Templates compile to graphs | Task-oriented safe starter flows |
| Comment trigger | Default | Supported | Durable idempotent execution |
| Message trigger | Default | Supported | Durable idempotent execution |
| Story-reply trigger | Default | Supported | Durable idempotent execution |
| Story-mention trigger | Not supported baseline | Temporarily disabled | Re-enable only after live contract tests |
| New-follower trigger | Not supported baseline | Catalog/legacy references exceed live support | Defer until Meta delivery is proven |
| Reply-to-comment action | Default | Supported | Idempotent provider side effect |
| Private-reply action | Default | Supported | Enforce one-per-comment and timing policy |
| Send-DM action | Default | Supported | Enforce messaging-window policy |
| Delay action | Default | Supported | Durable queued continuation pinned to workflow version |
| AI-response action | Optional | Provider settings required | Bring-your-own provider credentials |
| Send-email action | Optional | Email provider required | Explicit provider configuration and delivery health |
| Arbitrary HTTP action | Guarded | Hidden and activation-blocked | Egress policy, allowlist, limits, and abuse tests |
| Keyword condition | Default | Supported | Deterministic pure evaluation |
| Follower-count condition | Guarded | Removed from normal UI; activation and runtime fail closed | Implement verified metrics or keep deferred |
| Comment-count condition | Guarded | Removed from normal UI; activation and runtime fail closed | Implement verified metrics or keep deferred |
| Post creation and drafts | Default | Present | Retain Supabase persistence with workspace isolation |
| Scheduling and calendar | Default | Present | Supabase Cron plus durable queued jobs |
| AI publishing automations | Optional | Present | Worker-backed, approval-aware generation |
| Media upload and generated assets | Default | Supabase Storage | Retain Supabase Storage with verified access policies |
| Comments management | Default | Present | Supabase-backed durable sync and actions |
| Messages and conversations | Default | Present | Retain Supabase-backed sync, Realtime, and SWR updates |
| Analytics | Default | Present | Repository-backed sync and dashboards |
| Content intelligence | Optional | AI/provider dependent | Retain behind configured provider |
| Assistant | Optional | AI/provider dependent | Retain behind configured provider |
| Brand profiles and assets | Default | Present | Retain workspace-scoped Supabase data and Storage |
| Developer API | Decision pending | Present | Retain; decide default or optional module |
| MCP endpoint | Decision pending | Present | Retain; decide default or optional module |
| Audit logs and retention | Default | Present in parts | Versioned retention and operator controls |
| Billing and hosted entitlements | Optional | Stripe scaffolding present | Off by default unless explicitly retained |
| Premium responsive UI | Default | Existing mixed feature UI | Shared design system and verified journeys |
| Docker/Compose full-backend self-hosting | Deferred | Partial staging and operations artifacts exist | Optional post-v1 advanced edition; not required for standard installation |
| Managed Supabase backend | Default | Current runtime | Productize user-owned project setup, migrations, functions, secrets, Queue, Cron, and health checks |

## Decisions already fixed

- Product direction is automation-first and deploy-your-own.
- The standard installation is Vercel plus a user-owned managed Supabase project.
- No VPS is required for the standard installation.
- Supabase Auth, PostgreSQL, Storage, Realtime, Edge Functions, Queues, and Cron remain in stable v1.
- Instagram Login is the default Meta path.
- Facebook Login is an optional advanced path.
- Webhooks remain a core boundary and must acknowledge only after durable
  persistence.
- The automation engine remains graph-backed and canvas-first.
- Premium-grade UI is required for stable v1.
- The engineering migration stays in the current repository on the neutral
  `swiftflow-v2-transformation` branch.
- npm is the authoritative transformation package manager.

## Decisions still required

1. OSS license.
2. Whether multi-workspace/team features are enabled by default.
3. Whether Developer API and MCP are enabled by default.
4. Whether hosted billing remains as an optional module.
5. Supported upgrade window and migration policy.
6. Stable-v1 capacity and latency SLOs.
7. Visual direction, theme scope, browser versions, and minimum viewport.
