# Unsplash Integration Setup Guide

## Step 1: Update Database Schema

Run this SQL in your Supabase SQL Editor to update the `generated_assets` table:

```sql
-- Add new columns to generated_assets table
ALTER TABLE generated_assets 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'gemini',
ADD COLUMN IF NOT EXISTS unsplash_id TEXT,
ADD COLUMN IF NOT EXISTS attribution JSONB;

-- Add comment for documentation
COMMENT ON COLUMN generated_assets.source IS 'Image source: gemini or unsplash';
COMMENT ON COLUMN generated_assets.unsplash_id IS 'Unsplash photo ID for tracking';
COMMENT ON COLUMN generated_assets.attribution IS 'Photographer attribution data for Unsplash images';
```

## Step 2: Deploy Edge Functions

Deploy the new Unsplash Edge Functions to Supabase:

```bash
# Deploy search function
supabase functions deploy search-unsplash --no-verify-jwt

# Deploy select image function
supabase functions deploy select-unsplash-image --no-verify-jwt
```

## Step 3: Set Unsplash API Key

Add your Unsplash Access Key to Supabase secrets:

```bash
supabase secrets set UNSPLASH_ACCESS_KEY=your_unsplash_access_key_here
```

**Your Unsplash Access Key:** `aD3fp-0Qgw07kg5SyxgpP3ZX3TvG2kHc4wL2WuMLxuw`

## Step 4: Test the Integration

1. **Start your dev server** (if not already running):
   ```bash
   npm run dev
   ```

2. **Test the flow**:
   - Go to Dashboard > Assistant
   - Click "Create an image"
   - Select "Search Unsplash"
   - Search for something (e.g., "coffee shop")
   - Select an image from the results
   - Verify the image appears with photographer attribution

## Verification Checklist

- [ ] Database schema updated successfully
- [ ] Edge Functions deployed without errors
- [ ] Unsplash API key set in Supabase secrets
- [ ] Image source selector appears in chat
- [ ] Unsplash search returns results
- [ ] Selected images show photographer attribution
- [ ] Images can be used in post creation

## Troubleshooting

### "Unsplash API key not configured"
- Make sure you've set the secret: `supabase secrets set UNSPLASH_ACCESS_KEY=...`
- Verify the secret is set: `supabase secrets list`

### "Failed to fetch photo"
- Check that your Unsplash app is active
- Verify you haven't exceeded the 50 requests/hour limit (Demo app)

### Images not saving to database
- Check Supabase logs in the dashboard
- Verify the `generated_assets` table has the new columns

## Attribution Requirements

Unsplash requires proper attribution for all images. The integration automatically:
- Displays photographer name and link
- Tracks downloads (required by Unsplash API)
- Stores attribution data in the database

Make sure attribution is always visible when displaying Unsplash images!
