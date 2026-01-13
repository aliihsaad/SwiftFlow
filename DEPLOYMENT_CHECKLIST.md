# Vercel Deployment Checklist

Quick reference checklist for deploying to Vercel.

## Pre-Deployment

- [ ] All code changes committed and pushed to GitHub
- [ ] Local build successful (`npm run build`)
- [ ] Environment variables ready (see `.env.vercel.example`)
- [ ] Supabase project set up and running

## Supabase Setup

- [ ] Database migrations deployed
  ```bash
  supabase db push
  ```

- [ ] Supabase secrets configured for edge functions
  ```bash
  supabase secrets set SUPABASE_URL=your_url
  supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_key
  ```

- [ ] All edge functions deployed
  ```bash
  supabase functions deploy chat-assistant
  supabase functions deploy generate-caption
  supabase functions deploy generate-ideas
  supabase functions deploy generate-image
  supabase functions deploy generate-carousel
  supabase functions deploy refine-post
  supabase functions deploy repurpose-link
  supabase functions deploy list-models
  supabase functions deploy get-schedule
  supabase functions deploy get-analytics
  ```

## Vercel Setup

- [ ] Project imported to Vercel from GitHub
- [ ] Environment variables configured in Vercel:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_KEY`
  - [ ] `NEXT_PUBLIC_APP_URL` (set to placeholder initially)
  - [ ] `GEMINI_API_KEY` (optional - can be set via dashboard)
  - [ ] `FACEBOOK_CLIENT_ID` (optional)
  - [ ] `FACEBOOK_CLIENT_SECRET` (optional)
  - [ ] `NANO_BANANA_API_KEY` (optional)

- [ ] Initial deployment successful
- [ ] Deployment URL obtained (e.g., `https://yourapp.vercel.app`)

## Post-Deployment Configuration

- [ ] Update `NEXT_PUBLIC_APP_URL` in Vercel to actual deployment URL
- [ ] Redeploy after URL update

- [ ] Update Supabase redirect URLs:
  - [ ] Site URL: `https://yourapp.vercel.app`
  - [ ] Redirect URLs:
    - `https://yourapp.vercel.app/auth/callback`
    - `https://yourapp.vercel.app/api/auth/callback`
    - `https://yourapp.vercel.app/api/auth/social/callback`

- [ ] Update Facebook OAuth settings (if using):
  - [ ] App Domains: `yourapp.vercel.app`
  - [ ] Valid OAuth Redirect URIs:
    - `https://yourapp.vercel.app/api/auth/social/callback`

## Testing

- [ ] App loads successfully
- [ ] User registration/login works
- [ ] Workspace creation works
- [ ] Dashboard accessible
- [ ] AI features work (if API keys configured)
  - [ ] AI Assistant
  - [ ] Caption generation
  - [ ] Content ideas
- [ ] Social media connections work (if configured)
- [ ] Settings page loads and saves correctly

## Optional: Custom Domain

- [ ] Custom domain added in Vercel
- [ ] DNS records configured
- [ ] `NEXT_PUBLIC_APP_URL` updated to custom domain
- [ ] Supabase redirect URLs updated to custom domain
- [ ] Facebook OAuth URLs updated to custom domain (if using)

## Monitoring

- [ ] Vercel deployment logs checked
- [ ] Supabase edge function logs checked
- [ ] No console errors in browser
- [ ] All features tested in production

## Documentation

- [ ] Team notified of deployment
- [ ] API keys documented (securely)
- [ ] Custom configurations documented
- [ ] Monitoring/alerting set up (if applicable)

---

## Quick Commands Reference

### Build locally:
```bash
npm run build
```

### Deploy all Supabase functions:
```bash
for func in chat-assistant generate-caption generate-ideas generate-image generate-carousel refine-post repurpose-link list-models get-schedule get-analytics; do
  supabase functions deploy $func
done
```

### View Vercel logs:
```bash
vercel logs
```

---

## Troubleshooting

**Build fails:**
- Check TypeScript errors locally first
- Verify all dependencies installed
- Check environment variables are set

**Authentication fails:**
- Verify Supabase URLs are correct
- Check redirect URLs match exactly
- Verify cookies are working (no CORS issues)

**AI features not working:**
- Configure API keys via Settings → AI Provider in dashboard
- OR set `GEMINI_API_KEY` in Vercel environment variables
- Check edge functions are deployed
- Verify Supabase secrets are set

**Need help?**
- See `VERCEL_DEPLOYMENT.md` for detailed guide
- Check Vercel logs for errors
- Check Supabase logs for database/function errors
