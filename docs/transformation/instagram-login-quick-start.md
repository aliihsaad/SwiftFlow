# Direct Instagram Login Quick Start

SwiftFlow uses direct Instagram Login as the default connection path for Instagram comment automations. A Facebook Page is not required. The older Facebook Login flow remains available for Facebook Page publishing and Page-specific features.

## Server configuration

Set these server-side values:

```env
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...
META_WEBHOOK_VERIFY_TOKEN=...
NEXT_PUBLIC_APP_URL=https://your-swiftflow-host.example
APP_SECRETS_ENCRYPTION_KEY=...
```

Do not expose the Instagram App ID through a `NEXT_PUBLIC_` variable. The connection starts from a server route, so both app credentials remain server-only.

The callback URL to register in the Instagram product is:

```text
https://your-swiftflow-host.example/api/auth/instagram/callback
```

The webhook callback remains the existing SwiftFlow ingress URL configured for the Meta app.

## Default permissions

The default automation setup requests only:

- `instagram_business_basic`
- `instagram_business_manage_comments`

Optional publishing or messaging permissions can be enabled with:

```env
INSTAGRAM_OAUTH_EXTRA_SCOPES=instagram_business_content_publish,instagram_business_manage_messages
```

Only the two documented optional values are accepted. Unknown or legacy permission names are ignored.

## User flow

1. Open **Brand Settings → Connected Accounts**.
2. Choose **Connect Instagram**.
3. Open the Instagram Quick Start.
4. Sign in to the Instagram professional account.
5. Approve the focused permissions.
6. SwiftFlow exchanges the short-lived token for a long-lived token.
7. SwiftFlow reads the account identity and subscribes the account to the `comments` webhook field.
8. The Quick Start verifies account type, permissions, token health, and webhook subscription.
9. The automation builder unlocks after all readiness checks pass.

## Health and recovery operations

All operations require `integrations:write` permission for the selected workspace.

| Operation | Route | Purpose |
| --- | --- | --- |
| Start login | `GET /api/auth/instagram/login?workspaceId=...` | Start direct Instagram OAuth |
| Verify | `POST /api/auth/instagram/verify` | Recheck profile, token, and webhook state |
| Subscribe | `POST /api/auth/instagram/subscribe` | Subscribe and read back the `comments` field |
| Refresh | `POST /api/auth/instagram/refresh` | Refresh a long-lived Instagram token |

The browser never receives or stores the access token. Tokens are encrypted before database storage, sent to Instagram using Bearer authorization where supported, and excluded from API errors.

## Readiness contract

An account is automation-ready only when all checks are true:

- a social account row exists for Instagram;
- the account type is Business or Creator;
- both default permissions are present;
- token health is not invalid;
- `comments` is present in the verified `subscribed_apps` response.

Provider actions should remain disabled until this contract reports `ready`.

## Rollback

The implementation is additive and requires no database migration. To roll it back, remove the `/api/auth/instagram/*` routes and Quick Start UI, restore the previous Instagram connect dialog, and leave the existing Facebook Login routes untouched. Existing encrypted social-account rows remain valid.
