<p align="center">
  <img src="public/logo.png" alt="SwiftFlow logo" width="160" />
</p>

# SwiftFlow

SwiftFlow is a Vercel + managed Supabase engagement command center for Instagram. It handles connected-account setup, comments and messages, engagement automations, provider content monitoring, and analytics.

SwiftFlow does not create, generate, schedule, or publish social content. A Facebook Page is not required.

Stable v1 is feature-locked. The canonical product boundary is documented in the [stable-v1 feature matrix](docs/transformation/stable-v1-feature-matrix.md), release evidence is tracked in the [stable-v1 release checklist](docs/release/stable-v1-release-checklist.md), and recovery procedures are in the [stable-v1 operations runbook](docs/release/stable-v1-operations.md).

## Core capabilities

- Direct connection through Instagram Login for Business and Creator accounts
- Webhook ingestion for comments, messages, story replies, and supported engagement events
- Unified inbox plus provider post and comment moderation
- Visual automations with comment, message, story-reply, Instagram action, delay, condition, Telegram, and AI-response nodes
- Durable execution, retries, delayed continuations, and redacted execution history
- Instagram analytics synchronization and reporting
- Workspace-scoped encrypted credentials, roles, and developer API access

## Deployment model

SwiftFlow uses two managed services:

- Vercel runs the Next.js application and public Instagram OAuth/webhook routes.
- Supabase provides PostgreSQL, Auth, Storage, Realtime, Edge Functions, and Cron.

There is no VPS deployment in the supported setup.

## Complete setup from scratch

### 1. Create the service accounts and projects

Create these manually before running deployment commands:

1. A [Supabase](https://supabase.com/dashboard) account and an empty hosted project.
2. A [Vercel](https://vercel.com/new) account and project connected to this repository.
3. A [Meta for Developers](https://developers.facebook.com/apps/) account and app with **Instagram API with Instagram Login**.

Record the following without sharing them in chat, screenshots, issues, or commits:

- Supabase project ref, project URL, client/anon key, server service-role key, and database password
- Final Vercel production URL
- Instagram App ID and Instagram App Secret

### 2. Install the local prerequisites

Required:

- Git
- Node.js 20 or newer
- npm
- Supabase CLI
- Vercel CLI

On Windows, install the Supabase CLI with Scoop or another method from the [official Supabase CLI guide](https://supabase.com/docs/guides/local-development/cli/getting-started). Install the Vercel CLI with:

```powershell
npm install --global vercel
```

Verify the tools:

```powershell
node --version
npm --version
supabase --version
vercel --version
```

Clone and install SwiftFlow:

```powershell
git clone https://github.com/aliihsaad/Social-Media-Manager-AI-Tool.git
Set-Location Social-Media-Manager-AI-Tool
npm install
```

### 3. Link the repository to both projects

Log in and link Supabase:

```powershell
supabase login
supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
```

Log in and link Vercel:

```powershell
vercel login
vercel link
```

`vercel link` creates the local `.vercel` project link. `supabase link` creates local metadata under `supabase/.temp/`. Both directories are excluded from Git.

### 4. Prepare the environment file

Copy the template:

```powershell
Copy-Item .env.vercel.example .env.local
```

Fill `.env.local` with the real values. At minimum, configure:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_CLIENT_OR_ANON_KEY
SUPABASE_SERVICE_KEY=YOUR_SERVER_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL=https://YOUR_PROJECT.vercel.app
RESEND_API_KEY=YOUR_RESEND_API_KEY
INVITE_EMAIL_FROM=SwiftFlow <invites@YOUR_DOMAIN>
INVITE_EMAIL_REPLY_TO=support@YOUR_DOMAIN
APP_SECRETS_ENCRYPTION_KEY=AT_LEAST_32_RANDOM_CHARACTERS
APP_SECRETS_ENCRYPTION_VERSION=v1
INSTAGRAM_APP_ID=YOUR_INSTAGRAM_APP_ID
INSTAGRAM_APP_SECRET=YOUR_INSTAGRAM_APP_SECRET
INSTAGRAM_OAUTH_EXTRA_SCOPES=instagram_business_manage_messages
META_WEBHOOK_VERIFY_TOKEN=AT_LEAST_32_RANDOM_CHARACTERS
APP_RELEASE_CHANNEL=production_full
```

Generate independent random values for the encryption key, webhook verify token, and optional developer API pepper. On Windows PowerShell with OpenSSL installed:

```powershell
openssl rand -base64 48
```

Do not reuse the Supabase service key, Instagram App Secret, encryption key, webhook token, or developer API pepper for one another. `.env.local` is ignored by Git.

For automatic team invitation emails, create a Resend API key and verify the domain used by `INVITE_EMAIL_FROM`. `INVITE_EMAIL_REPLY_TO` is optional. These are Vercel-only values: do not add them to Supabase Function secrets. If Resend is intentionally omitted, workspace invites can still be created and accepted, but the owner must share the generated invite link manually.

### 5. Configure the Meta Instagram app

Meta changes dashboard labels periodically, but the required configuration is stable:

1. Add the **Instagram API with Instagram Login** product/use case.
2. Use an Instagram **Business or Creator** account. No Facebook Page link is required.
3. In Development mode, add the Instagram account as a tester and accept the invitation from Instagram.
4. Add this exact valid OAuth redirect URI:

   ```text
   https://YOUR_PROJECT.vercel.app/api/auth/instagram/callback
   ```

5. Configure the Instagram webhook:

   ```text
   Callback URL: https://YOUR_PROJECT.vercel.app/api/webhooks/instagram
   Verify token: the exact META_WEBHOOK_VERIFY_TOKEN from .env.local
   ```

6. Enable the app-level webhook fields used by SwiftFlow:
   - `comments`
   - `live_comments`
   - `messages`
   - `messaging_postbacks`
7. Configure these permissions:
   - `instagram_business_basic`
   - `instagram_business_manage_comments`
   - `instagram_business_manage_insights`
   - `instagram_business_manage_messages`

Do not request `instagram_business_content_publish`; SwiftFlow has no publishing feature. Development-mode testing works for accepted app testers. Connecting unrelated production users requires the relevant Meta App Review/Advanced Access approvals. If Meta requires public privacy or data-deletion URLs for review, supply your own externally hosted policy endpoints; SwiftFlow intentionally does not ship marketing or legal-policy pages.

Never paste Instagram credentials into a shell command. Keep them only in `.env.local`, Vercel encrypted variables, and Supabase Function secrets.

### 6. Configure Vercel and Supabase secrets

Recommended Windows command:

```powershell
npm run setup:secrets -- -SupabaseProjectRef YOUR_SUPABASE_PROJECT_REF
```

This reads `.env.local`, validates required names, sends the application values—including the Resend invitation-email settings—to the linked Vercel environment, and sends only the required Edge Function secrets to Supabase. It does not print secret values. Its temporary Supabase secret file is deleted in a `finally` block.

To target a non-production Vercel environment:

```powershell
npm run setup:secrets -- -SupabaseProjectRef YOUR_SUPABASE_PROJECT_REF -VercelEnvironment preview
```

Manual dashboard fallback:

- Vercel → Project → Settings → Environment Variables: add every non-empty value from `.env.local` for Production. `RESEND_API_KEY` must be encrypted/sensitive; `INVITE_EMAIL_FROM` and the optional `INVITE_EMAIL_REPLY_TO` remain server-side variables.
- Supabase → Project Settings → Edge Functions → Secrets: add `APP_SECRETS_ENCRYPTION_KEY`, `APP_SECRETS_ENCRYPTION_VERSION`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, and `META_WEBHOOK_VERIFY_TOKEN`.

Supabase automatically supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to its Edge Functions; do not duplicate those built-in values as custom Function secrets.

### 7. Configure Supabase Auth URLs

In Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `https://YOUR_PROJECT.vercel.app`
- Production redirect URL: `https://YOUR_PROJECT.vercel.app/auth/callback`
- Local redirect URL: `http://localhost:3000/auth/callback`

Use the exact production origin. This controls account confirmation, sign-in, invitations, and password-reset redirects.

### 8. Provision the first owner account

SwiftFlow does not expose public registration. Create the first account from the Supabase project before opening the app:

1. Open Supabase Dashboard → Authentication → Users.
2. Choose **Add user** → **Create new user**.
3. Enter the owner email and a strong temporary password. Enable **Auto confirm user** if the dashboard offers it; otherwise complete the confirmation email before signing in.
4. In Authentication → Providers → Email, keep public user sign-up disabled for a private SwiftFlow deployment.
5. Open the production SwiftFlow URL and sign in. The app will guide this first user through workspace creation and Instagram connection.

Provision future teammates in Supabase Auth with the same email address before sending their SwiftFlow workspace invitation. The public login page remains sign-in-only.

### 9. Validate and deploy Supabase

First validate the local environment:

```powershell
npm run validate:env
npm run setup:supabase:dry-run
```

Then apply all timestamped migrations and deploy the 21 active Edge Functions with their correct JWT settings:

```powershell
npm run setup:supabase -- --project-ref YOUR_SUPABASE_PROJECT_REF
```

The deployment helper stops immediately on the first failed migration or function deployment. It does not deploy the retired email worker or any publishing runtime.

### 10. Create the required one-minute scheduler

This is the one Supabase runtime step that remains manual because its authorization secret must not be committed.

In Supabase Dashboard → Integrations → Cron → Create job:

- Name: `scheduler-tick`
- Schedule: `* * * * *`
- Type: Supabase Edge Function
- Function: `scheduler-tick`
- Method: `POST`
- Timeout: 5000 ms or higher
- Header: `Content-Type: application/json`
- Header: `Authorization: Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY`
- Body: `{}`

Store the service-role key through the dashboard's secret/Vault input. Never put it in a migration or committed SQL file.

This single tick resumes Delay nodes every minute and dispatches retention cleanup, Instagram token refresh, and token-health checks at their internal offsets.

### 11. Deploy Vercel

Run the production build locally, then deploy:

```powershell
npm run build
vercel deploy --prod
```

If Vercel assigns a different production URL than the one in `.env.local`, update `NEXT_PUBLIC_APP_URL` in `.env.local`, rerun `npm run setup:secrets`, update the two Meta callback URLs and Supabase Auth URLs, then deploy again.

### 12. Run the deployment preflight

```powershell
npm run setup:check
```

The preflight is read-only. It verifies local project links, CLI access, environment-variable names (including Resend invitation delivery), all 21 deployed functions, Function secret names, and local migration history without displaying secret values.

For remote migration and Cron verification, temporarily set the database password only in the current terminal:

```powershell
$secureDbPassword = Read-Host "Supabase database password" -AsSecureString
$plainDbPassword = [System.Net.NetworkCredential]::new("", $secureDbPassword).Password
$env:SUPABASE_DB_PASSWORD = $plainDbPassword
try {
    npm run setup:check
}
finally {
    Remove-Item Env:SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue
    Remove-Variable secureDbPassword, plainDbPassword -ErrorAction SilentlyContinue
}
```

A successful installation reports zero failures. A warning about localhost is expected only when `NEXT_PUBLIC_APP_URL` intentionally points to local development.

### 13. Perform the real acceptance test

1. Open the production SwiftFlow URL and sign in with the owner account created in Supabase Auth.
2. Open Setup Guide and connect the accepted Instagram professional tester account.
3. Confirm readiness reaches `4 / 4`.
4. Create an active automation: New Comment → AI Response or fixed response → Reply to Comment or Private Reply.
5. Comment from a different Instagram account using the configured trigger keyword.
6. Confirm the reply arrives and the SwiftFlow execution history shows a completed run.
7. Test a DM/story-reply path if `instagram_business_manage_messages` is enabled.
8. Invite a test team member and confirm the Resend invitation email opens the correct `/invite/{token}` URL.
9. Check Supabase Cron history after two minutes for `scheduler-tick` HTTP 200/207 results.

The deployment is ready only after this real provider test succeeds.

## Day-to-day deployment

After initial setup:

```powershell
npm run test:ci
npm run build
npm run setup:supabase -- --project-ref YOUR_SUPABASE_PROJECT_REF
vercel deploy --prod
npm run setup:check
```

Only rerun `npm run setup:secrets` when a credential, URL, encryption key, release channel, or provider scope changes.

## Architecture

All tenant data is scoped by `workspace_id`. Server components read through the server Supabase client, client views use SWR-backed API routes, mutations enforce workspace permissions, and webhook/automation work runs through Supabase Edge Functions.

Key areas:

```text
app/dashboard/                 Dashboard pages and server data loading
app/api/                       OAuth, webhooks, inbox, analytics, and automation APIs
components/automation/         Canvas editor and execution history
components/messages/           Inbox and conversation UI
components/posts/              Provider posts and comments
components/analytics/          Analytics views
lib/automation/                Graph validation and automation helpers
supabase/functions/            Engagement workers, sync, scheduler, and maintenance
supabase/migrations/           Append-only database history
```

Historical publishing migrations and rows remain append-only for safe upgrades and auditability. They are not part of the active runtime.

## Official references

- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase CLI reference](https://supabase.com/docs/reference/cli/getting-started)
- [Deploy Supabase Edge Functions](https://supabase.com/docs/guides/functions/deploy)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Supabase Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Vercel CLI](https://vercel.com/docs/cli)
- [Deploy from Vercel CLI](https://vercel.com/docs/projects/deploy-from-cli)
- [Meta Instagram API with Instagram Login](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login)

See `supabase/functions/README.md` for the function map and internal invocation details.
