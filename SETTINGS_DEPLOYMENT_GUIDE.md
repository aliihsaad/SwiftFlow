# Settings System Deployment Guide

## Overview

Your app now has a complete settings management system where API keys and AI configuration can be managed per workspace through the dashboard instead of environment variables.

## ✅ What Was Implemented

### 1. **Database Layer**
- **Table**: `workspace_settings` with all AI provider settings
- **Columns**:
  - AI Provider: `ai_provider`, `gemini_api_key`, `openai_api_key`
  - AI Config: `ai_model_name`, `ai_temperature`, `ai_max_tokens`
  - Social: `facebook_app_id`, `instagram_app_id` (for future)
- **Security**: Row Level Security (RLS) policies - only workspace owners can update
- **Auto-creation**: Default settings auto-created when workspace is created

### 2. **Backend Layer**
- **Server Actions** (`app/actions/settings.ts`):
  - `getWorkspaceSettings(workspaceId)` - Get settings for a workspace
  - `getCurrentWorkspaceSettings()` - Get settings for active workspace
  - `updateWorkspaceSettings(workspaceId, settings)` - Update settings (owner only)
  - `updateCurrentWorkspaceSettings(settings)` - Update current workspace

### 3. **UI Layer**
- **Settings Page**: New "AI Provider" tab in Settings
- **API Settings Form**: Full form with:
  - AI Provider selection (Gemini/OpenAI)
  - API Key input with show/hide toggle
  - Model name configuration
  - Temperature slider (0-2)
  - Max tokens input (256-8192)
  - Save button with loading state

### 4. **Edge Functions**
- **chat-assistant**: Reads Gemini API key from database
- **generate-caption**: Reads Gemini API key from database
- Both support fallback to environment variables

### 5. **Server-Side Functions**
- **lib/gemini.ts**: Updated to read from database
  - All functions now accept `workspaceId` parameter
  - Dynamically loads settings per workspace

## 🚀 Deployment Steps

### Step 1: Run Database Migration

```bash
# If using Supabase CLI
supabase db push

# Or manually run the migration SQL in Supabase Dashboard
# File: supabase/migrations/create_settings_table.sql
```

### Step 2: Deploy Edge Functions

```bash
# Deploy chat assistant
supabase functions deploy chat-assistant

# Deploy caption generator
supabase functions deploy generate-caption
```

### Step 3: Set Supabase Secrets (Required for Edge Functions)

```bash
# These are needed for edge functions to access the database
supabase secrets set SUPABASE_URL=your_supabase_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Step 4: Build and Deploy Next.js App

```bash
npm run build
# Deploy to your hosting platform (Vercel, Netlify, etc.)
```

## 📝 Usage Instructions

### For Users:

1. **Navigate to Settings**
   - Go to Dashboard → Settings
   - Click on "AI Provider" tab

2. **Configure API Keys**
   - Select your AI provider (Gemini or OpenAI)
   - Enter your API key
   - Configure model settings (optional)
   - Click "Save Settings"

3. **Use AI Features**
   - AI Assistant will now use your configured key
   - Caption generation will use your configured key
   - Settings are per-workspace (each workspace can have different keys)

### For Developers:

#### Using Gemini Functions (Server-Side)

```typescript
import { generateText, chatWithAI } from '@/lib/gemini'

// You must pass workspaceId now
const result = await generateText(prompt, workspaceId)
const chatResponse = await chatWithAI(messages, workspaceId)
```

#### Calling Edge Functions (Client-Side)

```typescript
import { createClient } from '@/utils/supabase/client'

const supabase = createClient()

// Chat Assistant
const { data } = await supabase.functions.invoke('chat-assistant', {
  body: {
    messages: [...],
    workspaceId: 'workspace-uuid'
  }
})

// Caption Generator
const { data } = await supabase.functions.invoke('generate-caption', {
  body: {
    description: '...',
    platforms: ['instagram'],
    workspaceId: 'workspace-uuid'
  }
})
```

## 🔐 Security Features

1. **RLS Policies**: Only workspace owners can update settings
2. **API Keys Hidden**: Password fields hide keys by default
3. **Service Role Access**: Edge functions use service role to bypass RLS
4. **Per-Workspace Isolation**: Each workspace has separate settings

## 🎯 Key Benefits

1. **No Environment Variables**: Users manage keys in dashboard
2. **Per-Workspace Configuration**: Different clients can use different keys
3. **Dynamic Model Selection**: Switch AI models without redeployment
4. **Temperature Control**: Fine-tune AI creativity per workspace
5. **Fallback Support**: Still works with env variables during migration

## 📊 Database Schema Reference

```sql
CREATE TABLE workspace_settings (
  id UUID PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id),

  -- AI Provider
  ai_provider VARCHAR(50) DEFAULT 'gemini',
  gemini_api_key TEXT,
  openai_api_key TEXT,

  -- AI Configuration
  ai_model_name VARCHAR(100) DEFAULT 'gemini-1.5-flash',
  ai_temperature DECIMAL(2,1) DEFAULT 0.7,
  ai_max_tokens INTEGER DEFAULT 2048,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(workspace_id)
);
```

## 🐛 Troubleshooting

### "API key not configured" Error
- Go to Settings → AI Provider
- Enter your Gemini API key
- Save settings

### Edge Function Errors
- Check Supabase secrets are set
- Verify edge functions are deployed
- Check workspace_settings table exists

### Migration Failed
- Run migration manually in Supabase Dashboard
- Check for existing workspace_settings table conflicts

## 🔄 Migration from Environment Variables

Your existing `GEMINI_API_KEY` environment variable will still work as a fallback. Users can gradually migrate to dashboard-based configuration.

## 📚 Next Steps

1. Deploy the database migration
2. Deploy edge functions with secrets
3. Deploy the Next.js app
4. Configure API keys in Settings UI
5. Test AI features

## 🎉 Done!

Your settings system is now complete and ready for production use!
