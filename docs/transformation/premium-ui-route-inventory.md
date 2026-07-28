# SwiftFlow Premium UI Route Inventory

**Status:** Phase 0 draft
**Updated:** 2026-07-26
**Observed page files:** 22
**Observed TSX feature/UI components:** 108 across 16 groups

## Priority model

- **P0 reference:** establishes the design system and must be approved first.
- **P1 core:** required for the automation-first product beta.
- **P2 supporting:** required for stable v1 after core journeys are coherent.
- **P3 conditional:** compliance, marketing, or optional-module surface.

## User-facing route inventory

| Route | Source | Journey | Priority | Stable-v1 expectation |
| --- | --- | --- | --- | --- |
| `/` | `app/page.tsx` | Product entry | P2 | Clear self-hosted automation positioning |
| `/pricing` | `app/pricing/page.tsx` | Commercial/optional | P3 | Align with final billing decision |
| `/login` | `app/login/page.tsx` | Authentication | P1 | Fast, focused sign-in with actionable errors |
| `/forgot-password` | `app/forgot-password/page.tsx` | Authentication | P2 | Consistent recovery states |
| `/reset-password` | `app/reset-password/page.tsx` | Authentication | P2 | Consistent recovery states |
| `/invite/[token]` | `app/invite/[token]/page.tsx` | Workspace invitation | P2 | Clear acceptance and invalid-token states |
| `/dashboard` | `app/dashboard/page.tsx` | Automation-first home | P1 | Prioritize automation health and next action |
| `/dashboard/onboarding` | `app/dashboard/onboarding/page.tsx` | Meta Quick Start | P0 reference | Lowest-friction Instagram setup and test |
| `/dashboard/automation` | `app/dashboard/automation/page.tsx` | Build/manage automation | P0 reference | Templates, canvas, readiness, activation |
| `/dashboard/comments` | `app/dashboard/comments/page.tsx` | Engagement inbox | P1 | Clear status, action, and automation context |
| `/dashboard/messages` | `app/dashboard/messages/page.tsx` | Messaging inbox | P1 | Conversation state and policy-window clarity |
| `/dashboard/posts` | `app/dashboard/posts/page.tsx` | Content creation | P1 | Compose, media, AI, approval, publish |
| `/dashboard/scheduled` | `app/dashboard/scheduled/page.tsx` | Calendar/scheduling | P1 | Calendar, queue state, reschedule feedback |
| `/dashboard/analytics` | `app/dashboard/analytics/page.tsx` | Analytics | P2 | Legible hierarchy and honest data states |
| `/dashboard/assistant` | `app/dashboard/assistant/page.tsx` | AI assistant | P2 | Provider-aware assistance and history |
| `/dashboard/settings` | `app/dashboard/settings/page.tsx` | Settings/Meta health | P0 reference | Connection health, permissions, recovery |
| `/dashboard/settings/select-page` | `app/dashboard/settings/select-page/page.tsx` | Advanced Facebook setup | P2 | Progressive disclosure for Page selection |
| `/dashboard/settings/brand` | `app/dashboard/settings/brand/page.tsx` | Brand profile | P2 | Guided brand data and asset management |
| `/dashboard/subscription` | `app/dashboard/subscription/page.tsx` | Billing | P3 | Present only when billing module is enabled |
| `/privacy` | `app/privacy/page.tsx` | Legal | P3 | Accurate, readable policy |
| `/terms` | `app/terms/page.tsx` | Legal | P3 | Accurate, readable policy |
| `/data-deletion` | `app/data-deletion/page.tsx` | Meta/legal compliance | P3 | Explicit deletion steps and completion state |

## Shared layouts

| Layout | Source | Required change |
| --- | --- | --- |
| Root | `app/layout.tsx` | Global tokens, typography, metadata, feedback layers |
| Dashboard | `app/dashboard/layout.tsx` | Premium navigation, workspace state, responsive shell |

## Component-group inventory

| Group | TSX files | Primary migration concern |
| --- | ---: | --- |
| analytics | 12 | Chart language, empty/error states, responsive density |
| assistant | 1 | Conversation hierarchy and generated-content states |
| auth | 1 | Form consistency and recovery guidance |
| automation | 17 | Canvas, templates, node configuration, activation, runs |
| comments | 3 | High-density engagement actions |
| create | 15 | Composer, upload, generation, preview, validation |
| dashboard | 6 | Information hierarchy and operational summary |
| invite | 1 | Invitation success/error states |
| landing | 1 | Product positioning and performance |
| layout | 3 | Navigation and responsive shell |
| messages | 4 | Conversation layout and messaging-window status |
| posts | 3 | Content cards and action states |
| scheduled | 3 | Calendar/list coordination and drag feedback |
| settings | 9 | Meta connection, brand, team, keys, advanced setup |
| ui | 26 | Shared primitive consolidation and variants |
| workspace | 3 | Workspace creation and switching |

## Three reference experiences

### 1. Meta Quick Start

Routes/surfaces:

- `/dashboard/onboarding`
- `/dashboard/settings`
- advanced Page selection only when Facebook mode is chosen

Required states:

- professional-account preflight;
- credential and callback setup;
- OAuth progress and callback failure;
- token, permission, webhook, and outbound-action health;
- exact recovery action.

### 2. Automation builder

Routes/surfaces:

- `/dashboard/automation`
- template selection;
- canvas;
- node inspector;
- activation-readiness review.

Required states:

- new/empty automation;
- valid draft;
- incomplete configuration;
- unsupported or guarded node;
- test mode;
- activation success/failure;
- saved draft versus published version.

### 3. Run inspector

The existing route inventory does not show a dedicated run-inspector page.
Stable v1 needs an integrated panel or route that provides:

- trigger/event identity;
- workflow version;
- per-node timeline;
- sanitized input/output;
- retry and lease state;
- provider response IDs;
- terminal reason;
- operator recovery action.

## Cross-cutting acceptance checklist

Every migrated primary route must pass:

- [ ] normal, loading, empty, error, success, disabled, and permission states;
- [ ] phone, tablet, laptop, and large-desktop layouts;
- [ ] keyboard operation and visible focus;
- [ ] labels, announcements, and contrast expectations;
- [ ] reduced-motion behavior;
- [ ] route performance budget;
- [ ] visual-regression coverage;
- [ ] no dead, misleading, or placeholder control;
- [ ] no silent loss of an approved capability.

## Current blockers

- A visual screenshot baseline cannot be captured until safe local runtime
  configuration is available.
- The visual direction, theme scope, supported browsers, and minimum viewport
  still require approval.
- The count-condition controls must be guarded before the automation reference
  design can be considered trustworthy.
