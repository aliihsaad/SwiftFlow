# Social Media Manager AI Tool 🚀

An AI-driven social media management platform built with Next.js and Supabase. It combines content creation, scheduling, Meta integrations, analytics, and automation in a multi-workspace product that is currently being hardened for Meta App Review.

## Documentation

- Active docs index: [docs/README.md](docs/README.md)
- Meta review execution workspace: [docs/app-review/README.md](docs/app-review/README.md)
- Historical and superseded docs: [docs/archive/README.md](docs/archive/README.md)

## ✨ Features

### 🤖 AI-Powered Content Generation
- **Smart Content Ideas**: Generate 5 personalized content ideas based on your brand profile
- **Caption Generation**: Create platform-specific captions with AI (Instagram, Facebook, LinkedIn, Twitter)
- **Image Generation**: AI-powered image creation for social media posts
- **Carousel Creator**: Generate multi-slide carousel content
- **Brand-Aware AI**: All AI features leverage your brand profile for consistent, on-brand content

### 💬 AI Assistant
- **Persistent Chat History**: Save and load conversation sessions
- **Multi-Function AI**: Switch between different AI capabilities (ideas, captions, images)
- **Context-Aware**: Remembers your brand voice, target audience, and industry
- **Session Management**: Organize conversations with automatic saving and history dropdown
- **Direct Post Creation**: "Schedule" and "Use in Post" buttons open creation modal with AI-generated content pre-filled

### 📅 Content Management
- **Post Scheduling**: Schedule posts across multiple platforms
- **Multi-Status Management**: Organize posts by status (Scheduled, Drafts, Posted, Failed)
- **Tab-Based Interface**: Quick navigation between post statuses with visual counts
- **Draft Management**: Save and edit drafts before publishing
- **Delete with Confirmation**: Remove posts from any status with safety confirmation
- **Interactive Calendar**: Visual calendar with drag-and-drop rescheduling
  - **Drag-and-Drop Rescheduling**: Move posts between dates with instant visual feedback
  - **Optimistic Updates**: Posts move immediately while API updates in background
  - **Disabled Past Dates**: Prevents scheduling or moving posts to past dates
  - **Platform Indicators**: Color-coded post badges (Instagram pink, Facebook blue)
  - **Month Navigation**: Browse through any month of the year
  - **Post Preview**: Hover over posts to see content, media, and platforms
- **Modal-Based Creation**: Create posts from anywhere via modal (no page navigation)
- **Multi-Platform Support**: Instagram, Facebook, LinkedIn, Twitter
- **Smart Empty States**: Context-aware messages for each post status

### 💬 Posts & Messages (Live Polling + Webhooks)
- **Unified Posts Feed**: Live-poll Instagram and Facebook posts directly from Meta API
- **Live Comments**: View and reply to comments in real-time (no database sync required)
- **Live Messages**: Poll Instagram DMs and Facebook Messages directly from Meta API
- **AI-Powered Replies**: Generate personalized replies using your brand voice and language
- **Post Context**: See which post each comment belongs to with thumbnail preview
- **Reply & Hide**: Reply directly or hide unwanted comments via Meta API
- **Conversation Threading**: View full conversation history with participants
- **Platform Tabs**: Seamlessly switch between Instagram and Facebook feeds
- **Instagram Webhooks**: Real-time event delivery for comments and messages (no polling delay)
- **Supabase Realtime**: Instant UI updates when new messages arrive via webhooks

### 🎨 Brand Profile
- **Comprehensive Brand Settings**: Business name, industry, description
- **Target Audience Definition**: Define your ideal customer
- **Brand Voice Configuration**: Set your unique communication style
- **Language Setting**: Configure your brand's primary language for AI-generated content
- **USPs & Content Themes**: Define what makes you unique
- **Visual Identity**: Logo, brand colors, reference images
- **Social Account Integration**: Connect Instagram and Facebook

### 📊 Analytics & Insights
- **Performance Tracking**: Monitor post engagement and reach
- **Platform-Specific Metrics**: Detailed analytics per social network (Facebook vs Instagram)
- **Per-Platform Breakdown**: Separate follower counts and growth charts for Facebook and Instagram
- **Enhanced Visualizations**: AreaChart with gradient fills and smart data padding
- **Account Analytics**: Individual account performance with platform indicators
- **Trend Analysis**: Identify what content performs best

### ⚡ Automation Engine
- **Webhook-Triggered Automations**: Instagram comments instantly trigger automations via webhooks (no polling delay)
- **Comment-to-DM Automations**: Automatically send DMs to users who comment on your Instagram posts
- **Keyword Triggers**: Trigger on any comment or only when specific keywords are mentioned
- **Auto Comment Reply**: Optionally reply to triggering comments with configurable messages
- **DM with Links**: Send opening message + button template with link (falls back to plain text)
- **Duplicate Prevention**: Tracks processed comments to avoid sending duplicate DMs
- **Webhook Signature Verification**: HMAC SHA256 verification of all incoming Meta webhook events
- **Idempotency Protection**: `webhook_events` table prevents duplicate event processing
- **Automation Logs**: Full audit trail of every trigger, reply, and DM sent
- **Per-Workspace Scoping**: Each automation is linked to a specific workspace and Instagram account
- **Multi-Step Setup Wizard**: Guided post selection → trigger config → reply config → DM config → review

### 🔐 Multi-Workspace Support
- **Workspace Isolation**: Separate data for different brands/clients
- **Team Members & Invites**: Owner-managed team members with invite links and automatic invite emails
- **Role-Based Access Control (RBAC)**: `owner`, `admin`, `editor`, `viewer` with server-enforced permissions and matching UI restrictions
- **Encrypted Secrets at Rest**: Workspace AI keys and external service credentials are encrypted in the database (`enc:v1:*` format)
- **Secure Credential APIs**: External service credentials are managed via server routes (no direct browser DB writes for secrets)
- **Email-Bound Invite Acceptance**: Invited users must sign up/sign in with the same invited email address to accept
- **Invite History**: Pending invites + invite history tracking (accepted/revoked/expired), including "accepted then left workspace" visibility
- **Workspace Switching**: Easy navigation between workspaces
- **Per-Workspace Social Accounts**: Connect exactly **one Facebook Page and one Instagram Business Account** per workspace
- **Smart Page Selector**: New OAuth flow allows selecting specific pages for each workspace to prevent token mixing

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 16.1.1 (App Router)
- **UI Library**: React 19.2.3
- **Styling**: Tailwind CSS 4
- **Components**: Radix UI, shadcn/ui
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Charts**: Recharts (analytics visualizations)
- **Drag & Drop**: @dnd-kit (for calendar rescheduling)
- **State Management**: React Hooks, SWR

### Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Edge Functions**: Deno (Supabase Functions)
- **AI Provider**: OpenRouter-first, with Gemini/OpenAI compatibility during migration
- **File Storage**: Supabase Storage

### Key Dependencies
```json
{
  "@google/generative-ai": "^0.24.1",
  "@supabase/supabase-js": "^2.90.1",
  "@dnd-kit/core": "^6.3.1",
  "@dnd-kit/sortable": "^9.0.0",
  "@dnd-kit/utilities": "^3.2.2",
  "next": "16.1.1",
  "react": "19.2.3",
  "framer-motion": "^12.25.0",
  "lucide-react": "^0.562.0"
}
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm/yarn
- Supabase account
- Google Gemini API key
- Git

### 1. Clone the Repository
```bash
git clone https://github.com/aliihsaad/Social-Media-Manager-AI-Tool.git
cd Social-Media-Manager-AI-Tool
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Create a `.env.local` file in the root directory:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenRouter AI (preferred)
OPENROUTER_API_KEY=your_openrouter_api_key

# Optional direct-provider fallbacks during migration
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key

# Meta/Facebook OAuth
NEXT_PUBLIC_META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
NEXT_PUBLIC_APP_URL=https://yourdomain.com
APP_RELEASE_CHANNEL=production_full
META_OAUTH_SCOPE_PROFILE=full

# Invite Emails (Resend)
RESEND_API_KEY=your_resend_api_key
INVITE_EMAIL_FROM=Your App <noreply@yourdomain.com>
INVITE_EMAIL_REPLY_TO=support@yourdomain.com

# Secret Encryption (must be identical in Vercel + Supabase Edge Functions)
APP_SECRETS_ENCRYPTION_KEY=your_long_random_secret
APP_SECRETS_ENCRYPTION_VERSION=v1
APP_SECRETS_ENCRYPTION_KEY_PREVIOUS=
DEVELOPER_API_KEY_PEPPER=your_different_long_random_secret
DEVELOPER_API_KEY_PEPPER_PREVIOUS=

# Direct Instagram Login and Webhooks
INSTAGRAM_APP_ID=your_instagram_app_id
INSTAGRAM_APP_SECRET=your_instagram_app_secret
META_WEBHOOK_VERIFY_TOKEN=your_random_verify_token

# Optional: Custom AI Model
# AI_MODEL_NAME=gemini-2.0-flash
```

For the Meta review deployment, set:

```env
APP_RELEASE_CHANNEL=review_phase_1
META_OAUTH_SCOPE_PROFILE=review_phase_1
```

This activates the reviewer-safe route and navigation gating and narrows the Meta OAuth dialog to the Phase 1 review scope.

### 4. Database Setup

#### Initialize Supabase
```bash
# Login to Supabase CLI
supabase login

# Link your project
supabase link --project-ref your_project_ref

# Run migrations
supabase db push
```

#### Apply Schema
The database schema includes:
- `workspaces` - Multi-tenant workspace management
- `workspace_members` - User-workspace relationships
- `workspace_invites` - Team invitation links and invite history
- `workspace_settings` - AI configuration per workspace
- `external_services` - Stored third-party service credentials/subscriptions (sensitive fields encrypted at rest)
- `workspace_brand_profiles` - Brand identity and voice
- `posts` - Content scheduling and drafts
- `published_posts` - Posts published to social platforms
- `chat_sessions` - AI conversation history
- `social_accounts` - Connected social media accounts
- `account_analytics` - Platform-specific follower metrics
- `comments` - Instagram/Facebook comments
- `conversations` - Instagram DM conversations
- `messages` - Individual DM messages
- `automations` - Automation rules (comment-to-DM triggers)
- `automation_logs` - Audit trail of automation executions
- `processed_comments` - Tracks comments already handled by automations
- `webhook_events` - Idempotency table for deduplicating webhook events

RLS and grants are managed by migrations in `supabase/migrations`. Do not disable RLS manually.

### 5. Deploy Edge Functions

> [!IMPORTANT]
> Canvas automation worker functions must be deployed with `--no-verify-jwt`.
> They are invoked internally by `automation-orchestrator` / `process-scheduled-executions`.
> If these workers are redeployed without `--no-verify-jwt`, canvas automations can stop dispatching and fail with `401 Invalid JWT`.

```bash
# Deploy all functions
supabase functions deploy chat-assistant
supabase functions deploy generate-ideas
supabase functions deploy generate-caption
supabase functions deploy generate-image
supabase functions deploy generate-carousel
supabase functions deploy generate-reply
supabase functions deploy generate-message-reply
supabase functions deploy process-scheduled-posts
supabase functions deploy sync-analytics
supabase functions deploy sync-comments
supabase functions deploy sync-messages
supabase functions deploy scheduler-tick
supabase functions deploy process-automations
supabase functions deploy process-scheduled-executions
supabase functions deploy automation-orchestrator
supabase functions deploy automation-worker-run --no-verify-jwt
supabase functions deploy automation-worker-ai-response --no-verify-jwt
supabase functions deploy automation-worker-reply-comment --no-verify-jwt
supabase functions deploy automation-worker-send-dm --no-verify-jwt
supabase functions deploy automation-worker-private-reply --no-verify-jwt
supabase functions deploy automation-worker-condition --no-verify-jwt
supabase functions deploy automation-worker-http-request --no-verify-jwt
supabase functions deploy automation-worker-send-email --no-verify-jwt
```

#### Set Function Secrets
```bash
supabase secrets set OPENROUTER_API_KEY=your_openrouter_api_key
supabase secrets set GEMINI_API_KEY=your_gemini_api_key
supabase secrets set APP_SECRETS_ENCRYPTION_KEY=your_long_random_secret
supabase secrets set APP_SECRETS_ENCRYPTION_VERSION=v1
```

> [!IMPORTANT]
> `APP_SECRETS_ENCRYPTION_KEY` must use the **same value** in Vercel env vars and Supabase function secrets.
> Follow [Credential storage and rotation](docs/security/credential-storage.md) before enabling v2 writes or changing the key.
> Never rotate only one runtime.

### 6. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
Social-Media-Manager-AI-Tool/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── meta/            # Meta OAuth callback
│   │   ├── brand/               # Brand profile & social status
│   │   ├── chat/
│   │   │   └── sessions/        # Chat history endpoints
│   │   ├── posts/               # Post CRUD operations
│   │   ├── automations/         # Automation CRUD & processing
│   │   │   ├── [id]/            # Single automation GET/PUT/DELETE
│   │   │   │   └── toggle/      # Toggle active/inactive
│   │   │   ├── instagram-accounts/ # List IG accounts
│   │   │   ├── instagram-media/ # Fetch IG posts for selection
│   │   │   └── process/         # Trigger automation processing
│   │   ├── webhooks/
│   │   │   └── instagram/       # Instagram webhook endpoint (comments & messages)
│   │   ├── external-services/   # Secure external credential CRUD (server-side)
│   │   ├── posts-media/         # Live media polling from Meta
│   │   ├── live-messages/       # Live messages polling from Meta
│   │   ├── sync-analytics/      # Analytics sync trigger
│   ├── dashboard/
│   │   ├── assistant/           # AI Assistant interface
│   │   ├── scheduled/           # Scheduled posts with calendar
│   │   ├── analytics/           # Analytics dashboard
│   │   ├── automation/          # Automation management
│   │   ├── comments/            # Comments management
│   │   ├── messages/            # DM/Messages management
│   │   └── settings/
│   │       └── brand/           # Brand profile settings
│   └── layout.tsx
├── components/
│   ├── analytics/               # Analytics charts & cards
│   ├── automation/              # Automation components
│   │   ├── automation-setup-modal.tsx  # Multi-step wizard
│   │   ├── post-selector.tsx    # IG post picker
│   │   ├── trigger-config.tsx   # Trigger configuration
│   │   ├── dm-config.tsx        # DM message builder
│   │   └── active-automations-list.tsx
│   ├── dashboard/               # Dashboard components
│   ├── layout/                  # Layout components (Sidebar)
│   ├── settings/                # Settings forms
│   └── ui/                      # shadcn/ui components
├── supabase/
│   ├── functions/
│   │   ├── chat-assistant/      # General AI chat
│   │   ├── generate-ideas/      # Content idea generation
│   │   ├── generate-caption/    # Caption generation
│   │   ├── generate-image/      # Image generation
│   │   ├── generate-carousel/   # Carousel generation
│   │   ├── generate-reply/      # AI comment replies
│   │   ├── generate-message-reply/ # AI DM replies
│   │   ├── process-scheduled-posts/ # Scheduled post publisher
│   │   ├── sync-analytics/      # Follower metrics sync
│   │   ├── sync-comments/       # Comments sync
│   │   ├── sync-messages/       # DM sync
│   │   ├── process-automations/ # Wizard automation engine + graph executor utilities
│   │   ├── process-scheduled-executions/ # Delay node scheduler runner
│   │   ├── automation-orchestrator/ # Canvas automation run orchestrator
│   │   ├── automation-worker-run/ # Canvas graph runner
│   │   └── automation-worker-*/ # Per-node workers
│   ├── migrations/              # Database migrations
│   └── schema.sql               # Database schema
├── lib/                         # Utility functions
├── utils/
│   ├── supabase/                # Supabase client utilities
│   └── meta-oauth.ts            # Meta OAuth helpers
└── public/                      # Static assets
```

## 🎯 Key Features Explained

### Brand Profile Integration
All AI features automatically use your brand profile to generate personalized content:
- **Business Context**: Industry, description, services
- **Audience Targeting**: Content tailored to your target audience
- **Brand Voice**: Maintains consistent tone across all content
- **USPs**: Highlights your unique selling points
- **Content Themes**: Stays aligned with your content strategy

### Edge Functions

#### `chat-assistant`
General-purpose AI chat for social media management questions.

#### `generate-ideas`
Generates 5 content ideas based on:
- Your brand profile
- Target audience
- Industry trends
- Content themes

**Response Format**:
```json
{
  "type": "content_cards",
  "data": [
    {
      "id": "unique_id",
      "title": "Catchy Hook",
      "body": "Full content description",
      "platform": "instagram"
    }
  ]
}
```

#### `generate-caption`
Creates platform-specific captions with:
- Brand voice alignment
- Target audience consideration
- Platform best practices
- Hashtag suggestions

#### `generate-image`
AI-powered image generation using Google's Imagen or similar models.

#### `generate-carousel`
Creates multi-slide carousel content with coordinated messaging.

#### `automation-orchestrator` + workers
Canvas automation execution is split across functions:
- `automation-orchestrator` receives webhook trigger context and creates runs
- `automation-worker-run` traverses graph nodes
- `automation-worker-*` executes node-specific actions (DM, private reply, AI response, etc.)
- Delay nodes are resumed via `process-scheduled-executions`

#### `process-automations`
Legacy/simple wizard automation executor is still kept for backward compatibility.

## 🔧 Configuration

### AI Model Selection
Configure your preferred model in Settings > AI Provider:
- `openai/gpt-4o-mini` via OpenRouter (default migration target)
- Gemini direct models for legacy compatibility
- OpenAI direct models for legacy compatibility

### Workspace Settings
Each workspace can have:
- Custom OpenRouter/Gemini/OpenAI API keys (encrypted at rest)
- Preferred AI model
- Brand profile
- Connected social accounts

## 📊 Database Schema Highlights

### `workspace_brand_profiles`
Stores comprehensive brand information:
```sql
- business_name
- industry
- business_description
- target_audience
- brand_voice
- language (for AI content generation)
- unique_selling_points (array)
- content_themes (array)
- logo_url
- brand_colors (jsonb)
- social handles
```

### `chat_sessions`
Persistent AI conversation history:
```sql
- workspace_id
- user_id
- title
- messages (jsonb)
- created_at
- updated_at
```

### `posts`
Multi-platform post management with status tracking:
```sql
- workspace_id
- content (text)
- media_urls (jsonb array)
- platforms (jsonb array)
- scheduled_for (timestamp)
- published_at (timestamp)
- status ('draft' | 'scheduled' | 'posted' | 'failed')
- metrics (jsonb)
- created_at
- updated_at
```

### `automations`
Comment-to-DM automation rules:
```sql
- workspace_id
- social_account_id
- type ('comment_to_dm')
- name
- is_active
- platform_post_id
- trigger_config (jsonb: trigger_type, keywords)
- comment_reply_config (jsonb: enabled, messages)
- dm_config (jsonb: opening_message, button_text, link_url)
- total_triggered
- total_dms_sent
```

### `automation_logs`
Audit trail of automation executions:
```sql
- automation_id
- trigger_comment_id
- commenter_id
- commenter_username
- comment_reply_sent
- dm_sent
- status ('pending' | 'processing' | 'completed' | 'failed')
- error_message
- triggered_at
```

## 🚢 Deployment

### Vercel (Recommended)
1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Environment Variables in Vercel
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
OPENROUTER_API_KEY
NEXT_PUBLIC_META_APP_ID
META_APP_SECRET
INSTAGRAM_APP_ID
INSTAGRAM_APP_SECRET
META_WEBHOOK_VERIFY_TOKEN
NEXT_PUBLIC_APP_URL
RESEND_API_KEY
INVITE_EMAIL_FROM
INVITE_EMAIL_REPLY_TO
APP_SECRETS_ENCRYPTION_KEY
APP_SECRETS_ENCRYPTION_VERSION
APP_SECRETS_ENCRYPTION_KEY_PREVIOUS
DEVELOPER_API_KEY_PEPPER
DEVELOPER_API_KEY_PEPPER_PREVIOUS
```

### Supabase Edge Functions
Already deployed via Supabase CLI. Monitor at:
```
https://supabase.com/dashboard/project/YOUR_PROJECT_ID/functions
```

## 🎨 UI/UX Features

### Chat Interface
- **Fixed Input Bar**: Always visible at bottom
- **Internal Scrolling**: Messages scroll independently
- **Session History**: Dropdown to switch between conversations
- **Real-time Saving**: Auto-saves every message
- **Responsive Design**: Optimized for all screen sizes

### Dashboard Layout
- **Sidebar Navigation**: Quick access to all features
- **Workspace Switcher**: Easy multi-workspace management
- **Dark Mode Support**: System-aware theme switching
- **Glassmorphism**: Modern, premium UI design

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📝 License

This project is private and proprietary.

## 🆘 Support

For issues or questions:
1. Check existing GitHub Issues
2. Create a new issue with detailed description
3. Include error logs and screenshots

## 🔮 Roadmap

### ✅ Recently Completed
- [x] **Team Members & Invites** - Owner-managed member list, invite links, invite acceptance page, and automatic invite emails (Resend)
- [x] **Workspace RBAC Enforcement** - `owner/admin/editor/viewer` roles enforced across posts, messages, comments, automations, settings, integrations, and analytics sync
- [x] **Secret Encryption at Rest** - `workspace_settings` AI keys and `external_services` credentials encrypted in DB, with secure server-side credential APIs and edge-function decryption support
- [x] **Meta OAuth Integration** - Connect Facebook Pages and Instagram Business accounts
- [x] **Multi-Workspace OAuth Fix** - Resolved empty `/me/accounts` issue with debug_token fallback
- [x] **Smart Page Selector** - Implemented page selection flow to enforce 1-to-1 workspace-to-page mapping and prevent token mixing
- [x] **Facebook Auto-Posting** - Publish posts directly to Facebook Pages via Meta API
- [x] **Instagram Direct Publishing** - Publish posts to Instagram Business accounts
- [x] **Scheduled Post Processing** - Cron-based edge function for auto-publishing scheduled posts
- [x] **Calendar Drag-and-Drop Rescheduling** - Move posts between dates with optimistic updates
- [x] **Modal-Based Post Creation** - Create posts from anywhere without page navigation
- [x] **AI Assistant Integration** - Direct post creation from AI-generated content
- [x] **Instagram Comments Management** - View, reply, and hide Instagram comments
- [x] **Instagram Direct Messages** - Full DM management with conversation threading
- [x] **AI Reply Generation** - Generate personalized comment replies using brand context
- [x] **Multi-Language AI Support** - All AI features respect brand profile language setting
- [x] **Brand Profile Language** - Configure language for AI-generated content (14 languages)
- [x] **Platform-Specific Analytics** - Separate Facebook and Instagram metrics with visual breakdowns
- [x] **Enhanced Chart UI** - AreaChart with gradients, smart data padding for limited datasets
- [x] **Platform Badges** - Visual indicators (FB/IG) on posts and analytics
- [x] **Multi-image Carousel Publishing** - Publish carousel posts to Instagram
- [x] **Automation Engine** - Comment-to-DM automations with keyword triggers, auto-replies, and link DMs
- [x] **Automation Processing Edge Function** - Background engine polling comments and sending DMs via Meta Graph API
- [x] **Automation Management UI** - Full CRUD with multi-step setup wizard (post selection → trigger → reply → DM → review)
- [x] **Live Posts Page** - Replaced DB-sync with live Meta API polling for posts and comments
- [x] **Live Messages Page** - Replaced DB-sync with live Meta API polling for DMs and Facebook messages
- [x] **Analytics Auto-Sync** - Automatic background syncing of analytics data on page load
- [x] **Instagram Webhooks** - Real-time webhook events for comments and messages, replacing polling
- [x] **Webhook Signature Verification** - HMAC SHA256 verification with separate Instagram app secret
- [x] **Instant Automation Triggers** - Automations fire immediately on comment via webhooks
- [x] **Supabase Realtime Messages** - Instant UI updates for new messages via Realtime broadcast

### 📋 Planned Features
- [ ] Advanced Team Collaboration Features (approvals, mentions, activity feed)
- [ ] Content Calendar Templates
- [ ] AI-Powered Hashtag Research
- [ ] Competitor Analysis
- [ ] Performance Predictions
- [ ] Bulk Post Scheduling
- [ ] Post Templates Library

## 🙏 Acknowledgments

- **Next.js** - React framework
- **Supabase** - Backend infrastructure
- **Google Gemini** - AI capabilities
- **Radix UI** - Accessible components
- **shadcn/ui** - Beautiful UI components
- **Tailwind CSS** - Utility-first styling

---

**Built with ❤️ for modern social media managers**
