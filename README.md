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

### 📅 Content Management
- **Post Scheduling**: Schedule posts across multiple platforms
- **Multi-Status Management**: Organize posts by status (Scheduled, Drafts, Posted, Failed)
- **Tab-Based Interface**: Quick navigation between post statuses with visual counts
- **Draft Management**: Save and edit drafts before publishing
- **Delete with Confirmation**: Remove posts from any status with safety confirmation
- **Calendar View**: Visual calendar with platform-specific post indicators
- **Multi-Platform Support**: Instagram, Facebook, LinkedIn, Twitter
- **Smart Empty States**: Context-aware messages for each post status

### 🎨 Brand Profile
- **Comprehensive Brand Settings**: Business name, industry, description
- **Target Audience Definition**: Define your ideal customer
- **Brand Voice Configuration**: Set your unique communication style
- **USPs & Content Themes**: Define what makes you unique
- **Visual Identity**: Logo, brand colors, reference images
- **Social Account Integration**: Connect Instagram and Facebook

### 📊 Analytics & Insights
- **Performance Tracking**: Monitor post engagement and reach
- **Platform-Specific Metrics**: Detailed analytics per social network
- **Trend Analysis**: Identify what content performs best

### 🔐 Multi-Workspace Support
- **Workspace Isolation**: Separate data for different brands/clients
- **Team Collaboration**: Multiple users per workspace
- **Workspace Switching**: Easy navigation between workspaces

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 16.1.1 (App Router)
- **UI Library**: React 19.2.3
- **Styling**: Tailwind CSS 4
- **Components**: Radix UI, shadcn/ui
- **Animations**: Framer Motion
- **Icons**: Lucide React
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
- `scheduled_posts` - Content scheduling
- `chat_sessions` - AI conversation history
- `social_accounts` - Connected social media accounts

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
│   │   ├── brand-profile/      # Brand profile API
│   │   └── chat/
│   │       └── sessions/        # Chat history endpoints
│   ├── dashboard/
│   │   ├── assistant/           # AI Assistant interface
│   │   ├── create/              # Post creation
│   │   ├── scheduled/           # Scheduled posts
│   │   ├── analytics/           # Analytics dashboard
│   │   └── settings/
│   │       └── brand/           # Brand profile settings
│   └── layout.tsx
├── components/
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
│   │   └── generate-carousel/   # Carousel generation
│   └── schema.sql               # Database schema
├── lib/                         # Utility functions
├── utils/
│   └── supabase/                # Supabase client utilities
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

- [ ] Instagram Direct Publishing
- [ ] Facebook Auto-Posting
- [ ] Advanced Analytics Dashboard
- [ ] Team Collaboration Features
- [ ] Content Calendar Templates
- [ ] AI-Powered Hashtag Research
- [ ] Competitor Analysis
- [ ] Performance Predictions

## 🙏 Acknowledgments

- **Next.js** - React framework
- **Supabase** - Backend infrastructure
- **Google Gemini** - AI capabilities
- **Radix UI** - Accessible components
- **shadcn/ui** - Beautiful UI components
- **Tailwind CSS** - Utility-first styling

---

**Built with ❤️ for modern social media managers**
