# SwiftFlow Stable-v1 Feature Matrix

**Status:** Feature locked

**Locked:** 2026-08-14

**Canonical project:** `Social-Media-Manager-AI-Tool`
**Product:** SwiftFlow

This file is the stable-v1 product contract. During the release-candidate soak,
only release-blocking fixes may change this scope.

## Supported deployment

SwiftFlow stable v1 runs on:

- Vercel for the Next.js application and public OAuth/webhook routes;
- one operator-owned managed Supabase project for PostgreSQL, Auth, Storage,
  Realtime, Edge Functions, and Cron;
- one operator-owned Meta app configured for Instagram API with Instagram
  Login.

There is no supported VPS or Docker self-hosting path in stable v1.

## Stable-v1 capabilities

| Area | Capability | Availability | Stable-v1 contract |
| --- | --- | --- | --- |
| Access | Email/password authentication, recovery, and session handling | Included | Supabase Auth; signup is part of the private setup flow, not a public landing page |
| Workspaces | Workspace isolation, roles, members, and invitations | Included | Every tenant-owned query is workspace scoped; invitations require Resend configuration |
| Instagram | Business/Creator account connection | Included | Direct Instagram Login; no Facebook Page link is required |
| Instagram | Permission and connection readiness | Included | Setup guide reports the account, permissions, webhook subscription, and automation readiness |
| Instagram | Automatic long-lived token renewal | Included | Scheduled refresh, locking, retry state, reconnect fallback, and optional Telegram warning |
| Instagram | Signed webhook ingestion | Included | Comments, direct messages, and story replies enter the durable automation pipeline |
| Engage | Posts, reels, and comments | Included | Provider media sync, reel playback, comment visibility, and supported moderation actions |
| Engage | Inbox | Included | Instagram conversations and replies with workspace-scoped credentials |
| Automations | Visual workflow canvas | Included | Versioned graphs, validation, templates, execution history, removable edges, and responsive editing |
| Automations | Triggers | Included | New comment, new direct message, and story reply |
| Automations | Instagram actions | Included | Send DM, private reply, and reply to comment |
| Automations | Flow actions | Included | Delay and condition, including explicit error paths |
| Automations | Telegram | Optional | Encrypted bot/chat configuration, notifications, and human approval/rejection gates |
| Automations | AI response | Optional | Bring-your-own Gemini, OpenAI, or OpenRouter-compatible provider configuration |
| Reliability | Durable execution | Included | Idempotent inbox/outbox processing, retries, delayed continuation, dead-letter state, safety gates, and redacted audit history |
| Analytics | Instagram performance reporting | Included | Account and media synchronization with clear permission or provider failure states |
| Brand | Brand profile | Included | Structured brand context for AI responses; no decorative asset library |
| Operations | Managed deployment workflow | Included | Repeatable Supabase migrations/functions plus Vercel deployment and read-only `setup:check` preflight |
| Advanced | Developer API and MCP bridge | Optional | Engagement-only API surface for owners/admins; no publishing scopes |
| Experience | Premium responsive UI | Included | Auth, setup, overview, analytics, posts/comments, inbox, automations, brand profile, and settings |

## Optional integrations

Optional integrations do not prevent the core Instagram engagement product from
running:

- an AI provider key enables AI Response nodes;
- Telegram credentials enable notifications and approval gates;
- a Resend API key enables team invitation email delivery;
- Developer API credentials enable external automation clients and MCP.

## Explicitly outside stable v1

The following are not stable-v1 product capabilities and must not be presented
as available in the UI, setup guide, or release notes:

- Facebook Login, Facebook Pages, or Messenger;
- content creation, AI content generation, drafts, publishing, scheduling, or a
  content calendar;
- public marketing/landing pages, public signup, subscription, billing, or
  hosted entitlements;
- the legacy Send Email automation node (Telegram replaces it in the stable
  canvas);
- an arbitrary HTTP-request automation node;
- story mentions, new-follower triggers, or metrics-based conditions that have
  not passed live provider contract tests;
- VPS, Docker Compose, or a fully self-hosted backend.

Legacy compatibility code may remain temporarily where removing it would risk
existing stored workflows. It is not part of the stable-v1 product contract and
must not be exposed as a new-workflow option.

## Change policy

Until the stable-v1 tag is created:

1. no new product features are accepted;
2. P0/P1 correctness, security, data-loss, authentication, deployment, and live
   Instagram failures may be fixed;
3. each fix must add or update regression coverage;
4. scope changes require an explicit post-v1 decision.
