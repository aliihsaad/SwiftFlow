# SwiftFlow Stable-v1 Feature Matrix

**Status:** Phase 0 draft
**Updated:** 2026-07-26

This matrix prevents the infrastructure and UI transformations from silently
removing active product behavior.

## Classification

- **Default:** enabled in the standard self-hosted installation.
- **Optional:** retained and supported, but disabled until configured.
- **Guarded:** retained but unavailable until its correctness/security gate
  passes.
- **Decision pending:** retained for stable v1; packaging default is unresolved.
- **Not supported baseline:** visible legacy or placeholder behavior that is not
  considered a functioning capability.

## Matrix

| Capability | Stable-v1 classification | Current baseline | Transformation target |
| --- | --- | --- | --- |
| Password authentication and recovery | Default | Current backend auth | Better Auth with tested user migration |
| Workspace isolation and memberships | Default | Workspace-scoped schema and policies | PostgreSQL repositories plus RLS |
| Multi-workspace and team administration | Decision pending | Present | Retain; choose default or optional packaging |
| Instagram Login | Default | Separate implementation still required | Lowest-friction Meta connection path |
| Facebook Login and Page features | Optional | Existing advanced path | Preserve behind explicit advanced setup |
| Meta webhook receipt | Default | Next.js callback plus current persistence/functions | Signed durable inbox and queued processing |
| Meta token and permission health | Default | Partial checks exist | Account Health Center and reconnect flow |
| Graph-backed automation engine | Default | Canvas graph is authoritative | Versioned, deterministic worker runtime |
| Automation presets/templates | Default | Templates compile to graphs | Task-oriented safe starter flows |
| Comment trigger | Default | Supported | Durable idempotent execution |
| Message trigger | Default | Supported | Durable idempotent execution |
| Story-reply trigger | Default | Supported | Durable idempotent execution |
| Story-mention trigger | Not supported baseline | Temporarily disabled | Re-enable only after live contract tests |
| New-follower trigger | Not supported baseline | Catalog/legacy references exceed live support | Defer until Meta delivery is proven |
| Reply-to-comment action | Default | Supported | Idempotent provider side effect |
| Private-reply action | Default | Supported | Enforce one-per-comment and timing policy |
| Send-DM action | Default | Supported | Enforce messaging-window policy |
| Delay action | Default | Supported | Durable continuation pinned to workflow version |
| AI-response action | Optional | Provider settings required | Bring-your-own provider credentials |
| Send-email action | Optional | Email provider required | Explicit self-host module and delivery health |
| Arbitrary HTTP action | Guarded | Hidden and activation-blocked | Egress policy, allowlist, limits, and abuse tests |
| Keyword condition | Default | Supported | Deterministic pure evaluation |
| Follower-count condition | Guarded | Removed from normal UI; activation and runtime fail closed | Implement verified metrics or keep deferred |
| Comment-count condition | Guarded | Removed from normal UI; activation and runtime fail closed | Implement verified metrics or keep deferred |
| Post creation and drafts | Default | Present | Provider-neutral repositories and storage |
| Scheduling and calendar | Default | Present | Single scheduler plus durable jobs |
| AI publishing automations | Optional | Present | Worker-backed, approval-aware generation |
| Media upload and generated assets | Default | Current object storage | S3-compatible object storage |
| Comments management | Default | Present | Provider-neutral sync and actions |
| Messages and conversations | Default | Present | Provider-neutral sync plus SSE updates |
| Analytics | Default | Present | Repository-backed sync and dashboards |
| Content intelligence | Optional | AI/provider dependent | Retain behind configured provider |
| Assistant | Optional | AI/provider dependent | Retain behind configured provider |
| Brand profiles and assets | Default | Present | Repository and object-storage boundaries |
| Developer API | Decision pending | Present | Retain; decide default or optional module |
| MCP endpoint | Decision pending | Present | Retain; decide default or optional module |
| Audit logs and retention | Default | Present in parts | Versioned retention and operator controls |
| Billing and hosted entitlements | Optional | Stripe scaffolding present | Off by default unless explicitly retained |
| Premium responsive UI | Default | Existing mixed feature UI | Shared design system and verified journeys |
| Docker/Compose self-hosting | Default | Missing production packaging | Documented install, backup, upgrade, rollback |
| Supabase compatibility path | Migration-only | Current runtime | Remove after verified cutover and rollback window |

## Decisions already fixed

- Product direction is automation-first and self-hosted.
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
2. Primary documented deployment platform after plain Compose.
3. Bundled object-storage implementation, if any.
4. Whether multi-workspace/team features are enabled by default.
5. Whether Developer API and MCP are enabled by default.
6. Whether hosted billing remains as an optional module.
7. Supported upgrade window and migration policy.
8. Stable-v1 capacity and latency SLOs.
9. Visual direction, theme scope, browser versions, and minimum viewport.
