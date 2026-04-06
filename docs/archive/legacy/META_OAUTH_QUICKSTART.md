# Meta OAuth - Quick Start

## 1. Add Environment Variables

Create or update `.env.local`:

```bash
# Meta/Facebook OAuth
NEXT_PUBLIC_META_APP_ID=your-app-id-here
META_APP_SECRET=your-app-secret-here

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 2. Use the Button

```tsx
import { ConnectMetaButton } from "@/components/connect-meta-button"

export default function SettingsPage() {
  return <ConnectMetaButton />
}
```

## 3. Test Locally

```bash
npm run dev
```

Click the button → Authorize on Facebook → Get redirected back

## 4. Deploy to Vercel

Add environment variables in Vercel:
- `NEXT_PUBLIC_META_APP_ID`
- `META_APP_SECRET`
- `NEXT_PUBLIC_APP_URL` = `https://your-app.vercel.app`

Update Meta redirect URIs:
- `https://your-app.vercel.app/api/auth/meta/callback`

## Files Created

- `utils/meta-oauth.ts` - OAuth utilities
- `app/api/auth/meta/callback/route.ts` - Callback handler
- `components/connect-meta-button.tsx` - Button component
- `app/(examples)/meta-oauth-example.tsx` - Usage example

## What Happens

1. User clicks button
2. Redirects to Facebook OAuth
3. User authorizes
4. Facebook redirects to `/api/auth/meta/callback?code=xxx`
5. Server exchanges code for token
6. Redirects to `/dashboard/settings?success=meta_connected`

## Next Steps

The token is logged but not stored yet. You'll need to:
- Store token in database
- Fetch Facebook Pages
- Resolve Instagram Business accounts
