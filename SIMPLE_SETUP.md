# Simple Settings Setup (5 Minutes)

Since this is your personal internal tool, I've removed all the complex RLS and permission logic. Here's the simple setup:

## 🚀 Quick Setup

### Step 1: Run SQL Script (2 minutes)

1. Open your **Supabase Dashboard**
2. Go to **SQL Editor** (left sidebar)
3. Click **"New Query"**
4. Copy the entire contents of: `scripts/simple-settings-setup.sql`
5. Paste and click **"Run"**

That's it! The table is created.

### Step 2: Configure Your API Key (1 minute)

1. Go to your app: `http://localhost:3000/dashboard/settings`
2. Click the **"AI Provider"** tab
3. Enter your **Gemini API Key**
4. Click **"Save Settings"**

### Step 3: Deploy Edge Functions (2 minutes)

```bash
# Set Supabase environment variables for edge functions
supabase secrets set SUPABASE_URL=your_supabase_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Deploy functions
supabase functions deploy chat-assistant
supabase functions deploy generate-caption
```

## ✅ Done!

Your AI features will now use the API key from the database instead of environment variables.

## 🎯 What Changed

- ❌ **Removed**: Complex RLS policies
- ❌ **Removed**: Permission checks (owner/admin/editor)
- ❌ **Removed**: Admin client complexity
- ✅ **Added**: Simple UPSERT for create/update
- ✅ **Added**: Automatic fallback to env variables
- ✅ **Added**: Simple UI in Settings page

## 📝 Benefits

1. **Change API keys without redeploying**
2. **Different keys per workspace** (if you add more)
3. **Configure AI model and temperature**
4. **Visual UI instead of .env files**

## 🔧 How It Works

1. Edge functions check database for API key
2. If not found, falls back to `GEMINI_API_KEY` environment variable
3. You can update keys anytime from Settings page
4. No complex permissions - you're the only user!

## 📊 What You Can Configure

- **AI Provider**: Gemini or OpenAI
- **API Key**: Your API key
- **Model Name**: e.g., `gemini-1.5-flash`, `gemini-1.5-pro`
- **Temperature**: 0-2 (creativity level)
- **Max Tokens**: 256-8192 (response length)

Enjoy your simplified settings system! 🎉
