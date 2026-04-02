# Project Analysis Report: Social Media Manager AI Tool

> Verified against the current repository on 2026-04-03. This version separates code-backed findings from product recommendations and removes claims that were not defensible from the repo alone.

---

## How To Read This

- **Verified**: directly supported by the current codebase or schema.
- **Inference**: likely operational or review risk based on the current implementation, but not provable from code alone.
- **Recommendation**: proposed change, not current behavior.

---

## 1. Meta App Review Readiness

### 1.1 Verified OAuth Scope Inventory

`full` mode currently requests 9 scopes in code via [`utils/meta-oauth.ts`](../utils/meta-oauth.ts):

| Scope | In `full` profile | In `review_phase_1` | Verified code usage |
|---|---|---|---|
| `public_profile` | Yes | Yes | Base login / profile access |
| `pages_show_list` | Yes | Yes | Page selection flow |
| `pages_read_engagement` | Yes | No | Analytics and post metrics paths |
| `pages_manage_posts` | Yes | Yes | Publishing flows |
| `instagram_basic` | Yes | Yes | IG account linking and media access |
| `instagram_content_publish` | Yes | Yes | IG publishing |
| `instagram_manage_insights` | Yes | No | IG analytics sync |
| `instagram_manage_comments` | Yes | No | Comment fetch / reply / moderation |
| `instagram_manage_messages` | Yes | No | DM inbox / reply flows |

Additional important note:

- **Verified**: `pages_messaging` is **not** part of the default scope list.
- **Verified**: it can only be added through `META_OAUTH_INCLUDE_PAGES_MESSAGING=true` or `META_OAUTH_EXTRA_SCOPES`.

Evidence:

- [`utils/meta-oauth.ts`](../utils/meta-oauth.ts) lines 16-38 define the base scopes.
- [`utils/meta-oauth.ts`](../utils/meta-oauth.ts) lines 76-88 conditionally append `pages_messaging`.

### 1.2 Verified Findings

#### F1. Messaging Scope Mismatch Is Real

**Verified**: the codebase has Instagram DM functionality that assumes `pages_messaging`, while OAuth does not request it by default.

Evidence:

- [`utils/meta-oauth.ts`](../utils/meta-oauth.ts) does not include `pages_messaging` in `FULL_SCOPES`.
- [`supabase/functions/sync-messages/index.ts`](../supabase/functions/sync-messages/index.ts) explicitly comments that IG message sync requires `instagram_manage_messages + pages_messaging`.
- [`app/api/live-messages/send/route.ts`](../app/api/live-messages/send/route.ts) sends through `POST /{pageId}/messages`.
- [`lib/meta-graph-errors.ts`](../lib/meta-graph-errors.ts) normalizes DM permission failures to missing `pages_messaging` / `instagram_manage_messages`.
- [`app/dashboard/messages/page.tsx`](../app/dashboard/messages/page.tsx) contains explicit UI handling for `pages_messaging` permission failures instead of hiding the feature.

Impact:

- **Inference**: DM features are not reliably review-safe unless `pages_messaging` is requested and approved, or the DM surface is hidden from the review path.
- **Verified**: current behavior is graceful degradation, not feature removal. The messages UI can disable sending and show permission errors, but the messaging surface still exists.

#### F2. Graph API Versions Are Mixed Across Active Code Paths

**Verified**: the repo currently uses 4 Meta Graph API versions.

| Version | Where it appears |
|---|---|
| `v24.0` | New Meta OAuth, publishing utilities, newer automation paths, `lib/meta-api-client.ts` |
| `v21.0` | Live messages, comments, post media, analytics sync, message sync, several automation/media routes |
| `v19.0` | Legacy OAuth callback at [`app/api/auth/social/callback/route.ts`](../app/api/auth/social/callback/route.ts) |
| `v18.0` | [`lib/meta-api.ts`](../lib/meta-api.ts) |

Additional finding:

- **Verified**: `lib/meta-api.ts` appears unused in the current repo. A search for `MetaAPIClient` usage only returns its own file.

Impact:

- **Inference**: this increases review and maintenance risk because auth, analytics, comments, and messaging are not all exercising the same API behavior.

#### F3. The Legacy OAuth Path Is Still Reachable and Looks Incompatible With The Current Schema

This is stronger than the original report's wording.

**Verified**:

- [`app/api/auth/social/connect/[platform]/route.ts`](../app/api/auth/social/connect/%5Bplatform%5D/route.ts) still exists and logs `Legacy OAuth route used. Prefer /api/auth/meta/login.`
- That route redirects to the legacy callback at [`app/api/auth/social/callback/route.ts`](../app/api/auth/social/callback/route.ts).
- The legacy callback uses `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` and `v19.0`.
- The legacy callback upserts `platform_user_id`, `platform_username`, and `is_active` into `social_accounts`.
- The current `social_accounts` schema in [`supabase/schema.sql`](../supabase/schema.sql) and [`supabase/migrations/20260221050000_baseline_schema.sql`](../supabase/migrations/20260221050000_baseline_schema.sql) does **not** define those columns.

Impact:

- **Verified**: the old route is not just inconsistent, it appears structurally out of sync with the current schema.
- **Inference**: if a user or reviewer hits the legacy flow, it is likely to fail or create unpredictable behavior.

#### F4. The Privacy Policy Under-Describes Actual Meta-Related Data Handling

**Verified**: the current privacy policy at [`app/privacy/page.tsx`](../app/privacy/page.tsx) only lists:

- Pages and profiles
- Content
- Insights

**Verified**: the repo also stores or processes all of the following:

- DMs via `conversations` and `messages`
- Comments via `comments`
- Automation execution state via `automation_logs` and `processed_comments`
- Webhook idempotency data via `webhook_events`
- AI chat history via `chat_sessions`
- AI-generated assets via `generated_assets`

Evidence:

- [`supabase/schema.sql`](../supabase/schema.sql) defines `comments`, `conversations`, `messages`, `chat_sessions`, and `generated_assets`.
- [`supabase/migrations/20260221050000_baseline_schema.sql`](../supabase/migrations/20260221050000_baseline_schema.sql) defines `automation_logs`, `processed_comments`, and `webhook_events`.
- [`app/api/webhooks/instagram/route.ts`](../app/api/webhooks/instagram/route.ts) writes to `webhook_events`, `conversations`, and `messages`.
- [`supabase/functions/process-automations/index.ts`](../supabase/functions/process-automations/index.ts) writes to `processed_comments` and `automation_logs`.

Impact:

- **Inference**: the current privacy page is too narrow relative to the implemented product behavior, especially if messaging, comments, and automations are part of the submitted feature set.

#### F5. Meta Tokens Are Stored Plaintext At The Application Layer

**Verified**:

- [`app/api/auth/meta/select-page/route.ts`](../app/api/auth/meta/select-page/route.ts) stores `access_token` directly into `social_accounts`.
- The same route stores `session.user_access_token` inside `social_accounts.metadata`.
- `oauth_page_sessions.user_access_token` is stored as plain text in schema / migrations.
- `social_accounts.access_token` is plain `TEXT` in [`supabase/schema.sql`](../supabase/schema.sql).

At the same time:

- **Verified**: AI keys use the `enc:v1:` application-level encryption path via [`lib/secret-crypto.ts`](../lib/secret-crypto.ts) and the workspace settings actions/routes.
- **Verified**: `.env.local` currently does not define `APP_SECRETS_ENCRYPTION_KEY`, so local encryption helpers would fail if invoked against raw values.

Nuance:

- This report does **not** claim Supabase encryption at rest is absent.
- It does claim the app is not applying the same app-level secret encryption to Meta tokens that it already applies to AI keys.

#### F6. The Review Scope Profile Depends Entirely On Env Configuration

**Verified**:

- `review_phase_1` exists in [`utils/meta-oauth.ts`](../utils/meta-oauth.ts).
- `getMetaScopeProfile()` defaults to `full` when `META_OAUTH_SCOPE_PROFILE` is unset.
- [`app/api/auth/meta/login/route.ts`](../app/api/auth/meta/login/route.ts) uses the default scope profile logic; it does not force a review-safe profile.

Impact:

- **Inference**: Phase 1 review is brittle unless the production env is explicitly set correctly.

#### F7. Supabase Service Key Naming Is Split Between App And Edge Runtime

**Verified**:

- Most Next.js server routes use `SUPABASE_SERVICE_KEY`.
- Edge functions use `SUPABASE_SERVICE_ROLE_KEY`.
- Some code paths use fallbacks for both, such as [`utils/supabase/admin.ts`](../utils/supabase/admin.ts), [`app/api/assistant/invoke/route.ts`](../app/api/assistant/invoke/route.ts), and [`app/api/sync-analytics/route.ts`](../app/api/sync-analytics/route.ts).

Impact:

- **Verified**: this is an operational consistency issue.
- **Inference**: a partial env setup in Vercel can break specific routes while edge functions still work.

### 1.3 Inference / Submission-Risk Considerations

These are not pure code bugs, but they are still useful review considerations:

- **Inference**: comment-reply and DM automations are likely to receive closer scrutiny than basic publishing because the repo implements auto-reply and send-DM behavior, not just manual tools.
- **Inference**: even though the messages UI now handles missing permissions more gracefully, a reviewer can still reach a partially disabled messaging surface unless it is intentionally hidden for review.

### 1.4 Recommended Meta Review Sequence

#### Phase 1 recommendation

Submit only the features already aligned with `review_phase_1`:

- `public_profile`
- `pages_show_list`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

Before submission:

1. Set `META_OAUTH_SCOPE_PROFILE=review_phase_1` in the deployed environment.
2. Disable or remove links to messaging, comments moderation, advanced analytics, and automation surfaces from the review flow.
3. Remove or hard-disable the legacy `/api/auth/social/*` flow.
4. Expand the privacy policy to describe comments, DMs, automations, webhooks, and AI-related storage.

#### Phase 2 recommendation

Add comments and analytics only after the submitted reviewer path demonstrates them cleanly:

- `instagram_manage_comments`
- `pages_read_engagement`
- `instagram_manage_insights`

#### Phase 3 recommendation

Add DM functionality only after the scope mismatch is resolved:

- `instagram_manage_messages`
- `pages_messaging`

---

## 2. AI Provider Architecture

### 2.1 Verified Current State

The original report understated an important inconsistency: the repo does **not** have uniform multi-provider behavior today.

| Function / surface | Uses `resolveAIConfig()` | Actual runtime support today | Notes |
|---|---|---|---|
| `chat-assistant` | Yes | Gemini-only | Still instantiates `GoogleGenerativeAI` directly |
| `generate-caption` | Yes | Gemini-only | Direct Gemini SDK usage |
| `generate-ideas` | Yes | Gemini-only | Direct Gemini SDK usage |
| `generate-carousel` | Yes | Gemini-only | Direct Gemini SDK usage |
| `research-topic` | Yes | Gemini-only | Gemini SDK + Google Search grounding |
| `generate-image` | Yes | Gemini-only | Gemini image endpoint + hardcoded model cascade |
| `generate-reply` | Yes | Gemini + OpenAI | Uses shared `generateText()` helper |
| `generate-message-reply` | Yes | Gemini + OpenAI | Uses shared `generateText()` helper |
| `automation-worker-ai-response` | Yes | Gemini + OpenAI | Provider-aware execution |

Implications:

- **Verified**: `workspace_settings.ai_provider` supports only `gemini` and `openai` today.
- **Verified**: `openrouter` is not implemented anywhere in schema or runtime code.
- **Verified**: several functions accept an OpenAI-selected workspace config, then still call Gemini-specific SDKs.

That means:

- **Inference**: switching a workspace to `openai` will likely break `chat-assistant`, `generate-caption`, `generate-ideas`, `generate-carousel`, `research-topic`, and `generate-image`.

### 2.2 Verified BYOK Gaps

The repo is not BYOK-only yet.

**Verified env fallbacks still exist in code:**

- [`supabase/functions/_shared/ai-config.ts`](../supabase/functions/_shared/ai-config.ts) falls back to `OPENAI_API_KEY`.
- [`supabase/functions/_shared/ai-config.ts`](../supabase/functions/_shared/ai-config.ts) falls back to `GEMINI_API_KEY`.
- [`supabase/functions/generate-image/index.ts`](../supabase/functions/generate-image/index.ts) has an extra Gemini env fallback path even after `resolveAIConfig()`.
- [`lib/gemini.ts`](../lib/gemini.ts) falls back to `process.env.GEMINI_API_KEY`.

### 2.3 Verified Model Selection Nuance

The original report said most text functions use the user's selected model. That is only partly true.

**Verified**:

- Most generation functions use `aiConfig.modelName`.
- `generate-reply` and `generate-message-reply` override Gemini workspaces to `gemini-2.0-flash` via a hardcoded `GEMINI_REPLY_MODEL`.
- `generate-image` does not use the workspace-selected model at all; it tries a hardcoded candidate list:
  - `gemini-2.5-flash-image`
  - `gemini-3-pro-image-preview`
  - `gemini-2.0-flash-preview-image-generation`

### 2.4 Verified Missing Provider Abstraction

`resolveAIConfig()` centralizes settings lookup, but it does **not** guarantee provider-agnostic execution.

This is the current architectural split:

- Config lookup is centralized.
- Text generation is only partially centralized.
- Provider execution is inconsistent across functions.

### 2.5 Recommendations

#### Recommendation A: Fix provider truth first

Pick one of these and make the code match it:

1. **Gemini-first product**
   - Keep Gemini as the only provider for `chat-assistant`, `caption`, `ideas`, `carousel`, `research`, and `image`.
   - Make OpenAI support explicit as limited to reply-generation and automation only.
2. **Real multi-provider product**
   - Refactor all text functions to use a shared provider-aware text generation layer like [`supabase/functions/_shared/generate-text.ts`](../supabase/functions/_shared/generate-text.ts).
   - Add capability checks so image generation and grounded research only appear for compatible providers.

#### Recommendation B: Enforce BYOK intentionally

If BYOK-only is the intended product model:

1. Remove all env fallback keys from runtime code.
2. Add proactive UI gating for AI features when the workspace key is missing.
3. Treat missing provider keys as setup-state, not runtime surprise.

#### Recommendation C: Add OpenRouter only after A and B

OpenRouter should be a third step, not the first step. Right now the repo does not yet have a clean provider execution layer to plug it into.

---

## 3. Subscription, Billing, and Monetization

### 3.1 Verified Current State

**Verified**:

- The public pricing page exists at [`app/pricing/page.tsx`](../app/pricing/page.tsx).
- The in-app subscription page exists at [`app/dashboard/subscription/page.tsx`](../app/dashboard/subscription/page.tsx) and renders [`components/settings/subscription-view.tsx`](../components/settings/subscription-view.tsx).
- No Stripe integration was found in the repo.
- No Paddle integration was found in the repo.
- No billing webhook handlers were found.
- No `usage_tracking` or `subscription_plans` tables exist in the current schema.
- No enforcement helpers such as `checkUsageLimit()` were found in app or function code.

### 3.2 Important Correction To The Original Report

The repo already contains monetization-related copy and UI, but it is mostly placeholder content.

**Verified examples:**

- [`app/pricing/page.tsx`](../app/pricing/page.tsx) says Pro includes "More AI usage and premium presets."
- [`components/settings/subscription-view.tsx`](../components/settings/subscription-view.tsx) contains hardcoded plan state, hardcoded prices, and hardcoded usage widgets.
- That same view currently says:
  - "AI Assistant (10 credits/mo)" on Free
  - "Unlimited AI generation" on Pro
  - "Using the free tier - limited AI credits and automations."

So the current issue is broader than "billing not implemented":

- **Verified**: parts of the UI already imply a credit-based monetization model that does not exist in code.

### 3.3 Recommendations

#### If the product is BYOK-only

Then the UI should stop talking about AI credits, AI usage caps, and unlimited AI generation unless those concepts are actually enforced.

Recommended cleanup:

1. Remove AI-credit language from [`app/pricing/page.tsx`](../app/pricing/page.tsx).
2. Replace hardcoded billing/usage widgets in [`components/settings/subscription-view.tsx`](../components/settings/subscription-view.tsx) with a clearly labeled placeholder or hide the page until billing exists.
3. Position future paid plans around platform limits that can actually be enforced, such as accounts, scheduled posts, automation volume, analytics history, team members, and exports.

#### If paid plans are coming soon

Build the minimum viable billing foundation before publishing plan promises:

1. One subscription table tied to workspace.
2. One usage ledger for the small set of metered platform actions.
3. Real enforcement points in scheduling, automation execution, and account connection flows.

---

## 4. Unsplash Footprint and Removal

### 4.1 Verified Current Unsplash Footprint

Unsplash is still wired into the product in multiple places.

Backend:

- [`supabase/functions/search-unsplash/index.ts`](../supabase/functions/search-unsplash/index.ts)
- [`supabase/functions/select-unsplash-image/index.ts`](../supabase/functions/select-unsplash-image/index.ts)
- [`app/api/assistant/invoke/route.ts`](../app/api/assistant/invoke/route.ts)

Frontend:

- [`app/dashboard/assistant/chat-interface.tsx`](../app/dashboard/assistant/chat-interface.tsx)
- [`app/dashboard/assistant/components/image-source-selector.tsx`](../app/dashboard/assistant/components/image-source-selector.tsx)
- [`app/dashboard/assistant/components/unsplash-results.tsx`](../app/dashboard/assistant/components/unsplash-results.tsx)
- [`components/create/media-upload-zone.tsx`](../components/create/media-upload-zone.tsx)

Docs / config:

- [`docs/archive/legacy/UNSPLASH_SETUP.md`](./archive/legacy/UNSPLASH_SETUP.md)
- [`README.md`](../README.md)
- [`docs/archive/legacy/DEPLOYMENT_CHECKLIST.md`](./archive/legacy/DEPLOYMENT_CHECKLIST.md)
- [`docs/archive/legacy/VERCEL_DEPLOYMENT.md`](./archive/legacy/VERCEL_DEPLOYMENT.md)
- [`env.example`](../env.example)

Additional verified detail:

- [`components/create/image-generator.tsx`](../components/create/image-generator.tsx) is an unused stub component with a hardcoded `images.unsplash.com` placeholder URL.
- A repo search for `ImageGenerator` found no imports of that component.

### 4.2 Important Correction To The Original Report

The original report said AI image generation writes to `generated_assets` with source "implied by `asset_type` + `content.model`."

The actual behavior is:

- **Verified**: `generate-image` inserts into `generated_assets` without specifying `source`.
- **Verified**: `generated_assets.source` defaults to `'gemini'` in [`supabase/schema.sql`](../supabase/schema.sql).
- **Verified**: Unsplash rows explicitly set `source: 'unsplash'`.

So the table-sharing conclusion was right, but the explanation was not.

### 4.3 Recommendations

If Unsplash is being removed:

1. Delete the two edge functions.
2. Remove Unsplash from the assistant flow and media upload flow.
3. Remove the allowed function entries from [`app/api/assistant/invoke/route.ts`](../app/api/assistant/invoke/route.ts).
4. Delete the unused [`components/create/image-generator.tsx`](../components/create/image-generator.tsx) component instead of rewriting it.
5. Remove `UNSPLASH_ACCESS_KEY` from env/docs.
6. Remove deployment references from docs.
7. Optionally clean `generated_assets` rows where `source = 'unsplash'`.

Keep:

- the `generated_assets` table itself, because AI image generation still uses it.

Optional later cleanup:

- after data migration decisions, you can decide whether `unsplash_id` and `attribution` should stay in schema or be retired.

---

## 5. Prioritized Actions

### P0: Highest-confidence fixes before any Meta submission

1. Remove or hard-disable the legacy `/api/auth/social/*` flow.
2. Set `META_OAUTH_SCOPE_PROFILE=review_phase_1` in the deployed review environment.
3. Gate messaging, comment moderation, advanced analytics, and automation surfaces out of the Phase 1 reviewer path.
4. Update the privacy policy to match the actual data categories in use.
5. Decide whether DM support is in scope now; if yes, reconcile `pages_messaging` properly.

### P1: Architecture fixes that affect reliability

1. Standardize the active Meta code path on one Graph API version family.
2. Stop storing Meta tokens as plain text if you want token handling to match your existing app-level secret pattern.
3. Make AI provider support truthful: either Gemini-first or actually provider-agnostic.
4. Remove runtime AI env fallbacks if BYOK-only is the intended product.

### P2: Product cleanup

1. Remove AI-credit language from pricing/subscription UI unless it will be enforced.
2. Remove Unsplash if Gemini image generation is the intended long-term path.
3. Replace mock subscription data with either real billing state or a clear placeholder.

---

## Summary

The strongest verified issues are:

1. DM scope mismatch: `pages_messaging` is not requested by default, but DM code expects it.
2. Legacy OAuth remains reachable and appears incompatible with the current `social_accounts` schema.
3. Privacy policy coverage is materially narrower than the implemented data flows.
4. Meta tokens are stored plaintext at the application layer while AI keys already use an app-level encryption pattern.
5. AI provider support is inconsistent: config lookup is shared, but several major functions are still Gemini-only.
6. Billing UI is currently mock / hardcoded and already makes promises the backend does not enforce.

The original report had the right instincts, especially around Meta review risk and Unsplash removal. The main improvements in this version are:

- removing unsupported certainty,
- correcting a few inaccurate technical explanations,
- surfacing the legacy OAuth/schema mismatch as a top-tier issue,
- and making the AI section reflect the real provider split in the code today.
