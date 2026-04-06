# Vercel Deployment Guide

Complete guide to deploying your Social Media Manager AI Tool to Vercel.

## Prerequisites

- [Vercel Account](https://vercel.com/signup) (free tier works)
- [Supabase Project](https://supabase.com) set up and running
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed (for edge functions)
- GitHub repository (or Git repo)
- All required API keys ready

---

## Part 1: Supabase Setup (15 minutes)

### Step 1: Deploy Database Migrations

If you haven't already, run the database migrations to create necessary tables:

```bash
# Using Supabase CLI
supabase db push

# OR manually in Supabase Dashboard → SQL Editor
# Run the SQL from: supabase/migrations/
```

### Step 2: Deploy Supabase Edge Functions

Your app has several edge functions that need to be deployed:

```bash
# Set required secrets for edge functions
supabase secrets set SUPABASE_URL=your_supabase_project_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Deploy all edge functions
supabase functions deploy chat-assistant
supabase functions deploy generate-caption
supabase functions deploy generate-ideas
supabase functions deploy generate-image
supabase functions deploy generate-carousel
supabase functions deploy generate-reply
supabase functions deploy generate-message-reply
supabase functions deploy search-unsplash
supabase functions deploy select-unsplash-image
supabase functions deploy process-scheduled-posts
supabase functions deploy sync-analytics
supabase functions deploy sync-comments
supabase functions deploy sync-messages
supabase functions deploy process-automations
supabase functions deploy process-scheduled-executions
supabase functions deploy automation-orchestrator
supabase functions deploy automation-worker-run
supabase functions deploy automation-worker-ai-response
supabase functions deploy automation-worker-reply-comment
supabase functions deploy automation-worker-send-dm
supabase functions deploy automation-worker-private-reply
supabase functions deploy automation-worker-condition
supabase functions deploy automation-worker-http-request
supabase functions deploy automation-worker-send-email
```

Verify deployment in Supabase Dashboard → Edge Functions.

---

## Part 2: Vercel Deployment (10 minutes)

### Step 1: Push to GitHub

Make sure your code is pushed to GitHub:

```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin master
```

### Step 2: Import Project to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New..." → "Project"**
3. **Import** your GitHub repository
4. Vercel will auto-detect Next.js settings

### Step 3: Configure Environment Variables

In the Vercel project settings, add these environment variables:

#### Required Variables:

| Variable | Where to Get It | Example |
|----------|----------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API | `eyJhbGc...` |
| `SUPABASE_SERVICE_KEY` | Supabase Dashboard → Settings → API (service_role key) | `eyJhbGc...` |
| `NEXT_PUBLIC_APP_URL` | Your Vercel deployment URL | `https://yourapp.vercel.app` |

#### Optional Variables (for full functionality):

| Variable | Where to Get It |
|----------|----------------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `NANO_BANANA_API_KEY` | Your image generation provider |
| `FACEBOOK_CLIENT_ID` | [Facebook Developers](https://developers.facebook.com/) → Your App → Settings |
| `FACEBOOK_CLIENT_SECRET` | Same as above |

**Pro Tip:** You can also manage AI API keys via the dashboard Settings page after deployment!

### Step 4: Deploy

1. Click **"Deploy"**
2. Wait for build to complete (~2-3 minutes)
3. Vercel will provide your deployment URL

---

## Part 3: Post-Deployment Setup (5 minutes)

### Step 1: Update Supabase Redirect URLs

1. Go to Supabase Dashboard → **Authentication → URL Configuration**
2. Add your Vercel URL to **Site URL**: `https://yourapp.vercel.app`
3. Add to **Redirect URLs**:
   ```
   https://yourapp.vercel.app/auth/callback
   https://yourapp.vercel.app/api/auth/callback
   https://yourapp.vercel.app/api/auth/social/callback
   ```

### Step 2: Update Facebook OAuth Settings (if using social auth)

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Your App → **Settings → Basic**
3. Add **App Domains**: `yourapp.vercel.app`
4. Facebook Login → **Settings**
5. Add to **Valid OAuth Redirect URIs**:
   ```
   https://yourapp.vercel.app/api/auth/social/callback
   ```

### Step 3: Update Environment Variable

In Vercel dashboard, update `NEXT_PUBLIC_APP_URL` to your actual Vercel URL:

```
NEXT_PUBLIC_APP_URL=https://yourapp.vercel.app
```

Redeploy to apply changes.

---

## Part 4: Test Your Deployment

### Checklist:

- [ ] App loads at your Vercel URL
- [ ] Can create an account / sign in
- [ ] Can create a workspace
- [ ] Dashboard loads correctly
- [ ] AI features work (if configured API keys)
- [ ] Social media connections work (if configured)
- [ ] Settings page loads and saves correctly

---

## Troubleshooting

### Build Fails

**Error: Missing environment variables**
- Make sure all required env vars are set in Vercel dashboard
- Redeploy after adding them

**Error: TypeScript errors**
- Run `npm run build` locally first to catch errors
- Fix any type issues before deploying

### Authentication Issues

**Redirect loop on login**
- Check Supabase redirect URLs match your Vercel domain
- Verify `NEXT_PUBLIC_APP_URL` is correct

**"Invalid API key" errors**
- Verify Supabase keys are correct
- Make sure you're using the ANON key for public, SERVICE key for server

### Edge Functions Not Working

**"Function not found" errors**
- Verify functions are deployed: `supabase functions list`
- Check Supabase secrets are set
- Verify CORS settings in edge functions

**"API key not configured" errors**
- Go to Settings → AI Provider in your deployed app
- Configure your Gemini API key via the UI
- OR set `GEMINI_API_KEY` in Vercel environment variables

---

## Environment Variables Reference

Quick reference for all environment variables:

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...

# App URL (Required)
NEXT_PUBLIC_APP_URL=https://yourapp.vercel.app

# AI Provider (Optional - can be set via dashboard)
GEMINI_API_KEY=your-gemini-key

# Image Generation (Optional)
NANO_BANANA_API_KEY=your-nano-banana-key

# Social Media (Optional)
FACEBOOK_CLIENT_ID=your-fb-app-id
FACEBOOK_CLIENT_SECRET=your-fb-app-secret
```

---

## Continuous Deployment

Vercel automatically redeploys when you push to your main branch:

```bash
git add .
git commit -m "Update feature"
git push origin master
```

Vercel will automatically build and deploy the changes.

---

## Custom Domain (Optional)

To use a custom domain:

1. Vercel Dashboard → Your Project → **Settings → Domains**
2. Add your custom domain
3. Update DNS records as instructed by Vercel
4. Update `NEXT_PUBLIC_APP_URL` to your custom domain
5. Update Supabase and Facebook redirect URLs to use custom domain

---

## Performance Tips

1. **Enable Analytics**: Vercel Dashboard → Analytics (free tier available)
2. **Edge Functions Region**: Functions auto-deploy to optimal regions
3. **Image Optimization**: Next.js automatically optimizes images
4. **Caching**: Next.js handles caching automatically

---

## Security Checklist

- [x] `.env` files are gitignored
- [x] Service role key is set as environment variable (not committed)
- [x] RLS policies enabled in Supabase
- [x] CORS properly configured for edge functions
- [x] Production environment variables are separate from development

---

## Monitoring and Logs

### Vercel Logs
- Vercel Dashboard → Your Project → **Deployments** → Click deployment → **Function Logs**

### Supabase Logs
- Supabase Dashboard → **Logs** → Choose service (Database, Auth, Edge Functions)

---

## Need Help?

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment Docs](https://nextjs.org/docs/deployment)
- [Supabase Vercel Integration](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)

---

## Done!

Your Social Media Manager AI Tool is now live on Vercel! 🎉

Visit your deployment URL and start managing your social media with AI.
