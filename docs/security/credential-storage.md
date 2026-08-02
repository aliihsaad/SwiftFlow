# Credential storage and rotation

SwiftFlow uses different storage primitives because passwords, opaque app tokens, and provider credentials have different requirements.

| Credential | Storage rule | Why |
| --- | --- | --- |
| User login password | Supabase Auth only | The application never stores or decrypts user passwords. |
| SwiftFlow Developer API token | HMAC-SHA-256 with a server pepper; plaintext shown once | The original token is never needed after creation. |
| Meta access/refresh tokens | AES-256-GCM application encryption | Workers must recover the token to call Meta. |
| Workspace AI keys | AES-256-GCM application encryption | Server and Edge Function AI clients must recover the key. |
| External-service passwords/API keys | AES-256-GCM application encryption | An authorized admin may explicitly reveal or copy them. |
| Global app/provider secrets | Vercel and Supabase Function secret stores | They are deployment credentials, not workspace data. |

Do not use bcrypt for Meta tokens, AI keys, webhook secrets, or external-service credentials. Bcrypt is a password-verification hash and cannot be reversed. SwiftFlow uses authenticated encryption for credentials it must later use, and keyed HMACs for high-entropy Developer API tokens that only need verification.

## Required variables

Generate independent random values; do not reuse the Supabase service-role key.

```bash
openssl rand -base64 48
```

Set these in Vercel:

```env
APP_SECRETS_ENCRYPTION_KEY=<random value, at least 32 characters>
APP_SECRETS_ENCRYPTION_VERSION=v1
DEVELOPER_API_KEY_PEPPER=<different random value, at least 32 characters>
```

Set the same application-encryption key and write version in Supabase Function secrets:

```bash
supabase secrets set APP_SECRETS_ENCRYPTION_KEY=...
supabase secrets set APP_SECRETS_ENCRYPTION_VERSION=v1
```

`DEVELOPER_API_KEY_PEPPER` is needed only by the Next.js application. `APP_SECRETS_ENCRYPTION_KEY` is needed by both Vercel and Supabase Edge Functions because both runtimes read workspace/provider credentials.

## Safe AES key rotation

The code reads both legacy `enc:v1` and keyed `enc:v2` payloads. V2 binds the key identifier as AES-GCM additional authenticated data.

1. Deploy the dual-reader code to Vercel and every Supabase Function that reads encrypted credentials. Keep the existing key and `APP_SECRETS_ENCRYPTION_VERSION=v1`.
2. Generate a new random encryption key.
3. In both Vercel and Supabase, set:

   ```env
   APP_SECRETS_ENCRYPTION_KEY=<new key>
   APP_SECRETS_ENCRYPTION_KEY_PREVIOUS=<old key>
   APP_SECRETS_ENCRYPTION_VERSION=v2
   ```

4. Redeploy both runtimes. Existing v1 records decrypt through the previous key; new and lazily upgraded records use keyed v2 encryption.
5. Verify Meta reconnect/publishing, one automation, each configured AI provider, and External Services reveal/copy.
6. Remove the previous key only after every stored credential has been upgraded or replaced. Removing it sooner makes remaining v1/old-key records unreadable.

Never rotate only Vercel or only Supabase. The current and previous encryption variables must match across both runtimes during the rotation window.

## Safe Developer API pepper rotation

Developer API tokens are stored only as HMACs. To introduce a dedicated pepper without invalidating existing keys:

```env
DEVELOPER_API_KEY_PEPPER=<new dedicated pepper>
DEVELOPER_API_KEY_PEPPER_PREVIOUS=<old fallback pepper>
```

When an existing token authenticates successfully with the previous pepper, SwiftFlow automatically rewrites its stored HMAC with the current pepper. Keep the previous pepper until all still-active old tokens have either been used once, regenerated, or revoked.

## Browser exposure rules

- Normal settings and External Services responses contain only `has_*` flags, never decrypted values.
- External-service reveal/copy uses an authenticated same-origin POST, a strict field allowlist, rate limiting, and `no-store` headers.
- Edit forms leave secret inputs empty. Blank means “keep the saved value”; removal is an explicit action.
- Provider credentials are decrypted only in server-only modules or Supabase Edge Functions immediately before use.
