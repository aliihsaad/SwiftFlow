# Social Media Manager AI Tool 🚀

A powerful, AI-driven social media management platform built with Next.js, Supabase, and Google's Gemini AI. Streamline your content creation, scheduling, and analytics with intelligent automation and brand-aware AI assistance.

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

### 💬 Comments & Messages Management
- **Instagram Comments Sync**: View comments from your Instagram posts
- **Instagram Direct Messages**: Manage DMs and conversations from Instagram Business accounts
- **AI-Powered Replies**: Generate personalized replies using your brand voice and language
- **Post Context**: See which post each comment belongs to with thumbnail preview
- **Reply & Hide**: Reply directly or hide unwanted comments
- **Reply Status Tracking**: Track which comments have been responded to
- **Conversation Threading**: View full conversation history with participants

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

### 🔐 Multi-Workspace Support
- **Workspace Isolation**: Separate data for different brands/clients
- **Team Collaboration**: Multiple users per workspace
- **Workspace Switching**: Easy navigation between workspaces
- **Per-Workspace Social Accounts**: Connect different Facebook/Instagram pages to each workspace
- **Seamless OAuth Flow**: Robust multi-workspace connection with automatic fallback handling

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
- **AI Provider**: Google Gemini AI
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

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# Meta/Facebook OAuth
NEXT_PUBLIC_META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Optional: Custom AI Model
# AI_MODEL_NAME=gemini-2.0-flash
```

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
- `workspace_settings` - AI configuration per workspace
- `workspace_brand_profiles` - Brand identity and voice
- `posts` - Content scheduling and drafts
- `published_posts` - Posts published to social platforms
- `chat_sessions` - AI conversation history
- `social_accounts` - Connected social media accounts
- `account_analytics` - Platform-specific follower metrics
- `comments` - Instagram/Facebook comments
- `conversations` - Instagram DM conversations
- `messages` - Individual DM messages

#### Set Permissions
Run this SQL in your Supabase SQL Editor:
```sql
-- Grant permissions for chat sessions
GRANT ALL ON TABLE chat_sessions TO anon, authenticated, service_role;
ALTER TABLE chat_sessions DISABLE ROW LEVEL SECURITY;

-- Grant permissions for brand profiles
GRANT ALL ON TABLE workspace_brand_profiles TO anon, authenticated, service_role;
ALTER TABLE workspace_brand_profiles DISABLE ROW LEVEL SECURITY;
```

### 5. Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy chat-assistant
supabase functions deploy generate-ideas --no-verify-jwt
supabase functions deploy generate-caption
supabase functions deploy generate-image
supabase functions deploy generate-carousel
supabase functions deploy publish-post
supabase functions deploy sync-analytics
supabase functions deploy sync-comments
supabase functions deploy sync-messages
```

#### Set Function Secrets
```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key
```

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
│   │   ├── sync-analytics/      # Analytics sync trigger
│   │   ├── sync-comments/       # Comments sync trigger
│   │   └── sync-messages/       # Messages sync trigger
│   ├── dashboard/
│   │   ├── assistant/           # AI Assistant interface
│   │   ├── scheduled/           # Scheduled posts with calendar
│   │   ├── analytics/           # Analytics dashboard
│   │   ├── comments/            # Comments management
│   │   ├── messages/            # DM/Messages management
│   │   └── settings/
│   │       └── brand/           # Brand profile settings
│   └── layout.tsx
├── components/
│   ├── analytics/               # Analytics charts & cards
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
│   │   ├── publish-post/        # Post publishing to Meta
│   │   ├── sync-analytics/      # Follower metrics sync
│   │   ├── sync-comments/       # Comments sync
│   │   └── sync-messages/       # DM sync
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

## 🔧 Configuration

### AI Model Selection
Configure your preferred Gemini model in Settings > AI Provider:
- `gemini-2.0-flash` (Default, fastest)
- `gemini-1.5-pro` (More capable)
- `gemini-1.5-flash` (Balanced)

### Workspace Settings
Each workspace can have:
- Custom Gemini API key
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
NEXT_PUBLIC_META_APP_ID
META_APP_SECRET
NEXT_PUBLIC_APP_URL
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
- [x] **Meta OAuth Integration** - Connect Facebook Pages and Instagram Business accounts
- [x] **Multi-Workspace OAuth Fix** - Resolved empty `/me/accounts` issue with debug_token fallback
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

### ⚠️ Limitations
- **Facebook Post Engagement** - Comments, likes, shares analytics for Facebook posts require `pages_read_engagement` permission (pending Meta App Review approval)
- **Facebook Comments Sync** - Disabled until `pages_read_engagement` is approved by Meta

### 📋 Planned Features
- [ ] Team Collaboration Features
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
