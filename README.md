# SwiftFlow

SwiftFlow is a self-hostable social engagement command center for Instagram and Facebook. Its product scope is deliberately focused on connected-account setup, comments and messages, engagement automations, provider content monitoring, and analytics.

SwiftFlow does not create, generate, schedule, or publish social content.

## Core capabilities

- Direct Instagram and Facebook account connection through Meta OAuth
- Webhook ingestion for comments, messages, and supported engagement events
- Unified inbox and provider post/comment moderation
- Visual automation builder with comment, message, story-reply, delay, condition, email, HTTP, and AI-response nodes
- Durable automation execution, retries, delayed continuations, and redacted execution history
- Instagram and Facebook analytics synchronization and reporting
- Per-workspace AI provider configuration for reply-generation nodes
- Workspace isolation, encrypted credentials, roles, and developer API access
- Supabase-backed database, authentication, storage, realtime, and edge functions

## Stack

- Next.js 16 App Router and React 19
- TypeScript and Tailwind CSS 4
- Supabase PostgreSQL, Auth, Storage, Realtime, and Edge Functions
- Meta Graph API v25
- SWR for live client data
- @xyflow/react for the automation canvas
- Recharts for analytics
- OpenRouter, Gemini, or OpenAI for automation replies

## Product boundaries

Retired runtime capabilities include:

- Post composer and drafts
- Content calendar
- Scheduled and immediate publishing
- Publishing automations
- Caption, idea, image, and carousel generation
- General-purpose content assistant
- Media upload endpoints intended for publishing

Historical database migrations and existing rows are preserved for auditability and safe upgrades. They are not part of the active runtime surface.

## Local development

    npm install
    npm run dev

Useful checks:

    npm run lint
    npm run test:ci
    npm run build

The app validates its environment before production builds.

## Required environment

    NEXT_PUBLIC_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY
    SUPABASE_SERVICE_ROLE_KEY
    NEXT_PUBLIC_APP_URL
    APP_SECRETS_ENCRYPTION_KEY

Configure one or both Meta integrations as credential pairs:

    NEXT_PUBLIC_META_APP_ID
    META_APP_SECRET

    INSTAGRAM_APP_ID
    INSTAGRAM_APP_SECRET

    META_WEBHOOK_VERIFY_TOKEN

Optional AI provider keys may be configured globally or per workspace:

    OPENROUTER_API_KEY
    GEMINI_API_KEY
    OPENAI_API_KEY

## Architecture

All tenant data is scoped by workspace_id. Server components read through the server Supabase client, client views use SWR-backed API routes, mutations enforce workspace permissions, and webhook/automation work runs through Supabase Edge Functions.

The active scheduler resumes delayed automation nodes and runs maintenance jobs. It does not publish social posts.

Key areas:

    app/dashboard/                 Dashboard pages and server data loading
    app/api/                       OAuth, webhooks, inbox, analytics, and automation APIs
    components/automation/         Canvas editor and execution history
    components/messages/           Inbox and conversation UI
    components/posts/              Provider posts and comments
    components/analytics/          Analytics views
    lib/automation/                Graph validation and automation helpers
    supabase/functions/            Engagement workers, sync, scheduler, and maintenance
    supabase/migrations/           Append-only database history

## Supabase functions

Reply AI:

- generate-reply
- generate-message-reply

Automation runtime:

- automation-orchestrator
- automation-worker-run
- automation-worker-ai-response
- automation-worker-condition
- automation-worker-http-request
- automation-worker-private-reply
- automation-worker-reply-comment
- automation-worker-send-dm
- automation-worker-send-email
- process-automations
- process-scheduled-executions

Synchronization and operations:

- sync-analytics
- sync-comments
- sync-messages
- scheduler-tick
- retention-cleanup
- token-health-sweep
- research-topic

See supabase/functions/README.md for deployment notes.