# Meta App Review Submission — Swift Digital Sol Social

---

## 1. App Summary

Swift Digital Sol Social is a social media management platform that allows businesses to connect their Facebook Pages and Instagram Business accounts, create and publish posts to those accounts, schedule posts for future publishing, and manage comments received on Instagram posts. The application is operated by Swift Digital Solutions (verified business portfolio). All content is authored or reviewed by the user before publishing; the platform does not autonomously generate or post content without user action.

---

## 2. Declared Use Cases

### Use Case 1: "Manage messaging & content on Instagram"

The application connects to a user's Instagram Business account (linked to a Facebook Page) via Meta OAuth. Once connected, users can:

- **Publish content to Instagram**: Users compose a caption and upload an image within the app, then publish directly to their Instagram Business account using the Container + Media Publish flow (`/{ig-user-id}/media` → `/{ig-user-id}/media_publish`).
- **Schedule content for Instagram**: Users set a future date/time. A server-side scheduled function picks up due posts and publishes them via the same two-step Instagram publishing flow.
- **Manage Instagram comments**: Users view comments on their Instagram posts, reply to comments, and hide unwanted comments — all through the Meta Graph API (`/{comment-id}/replies`, `/{comment-id}?hide=true`).

### Use Case 2: "Manage everything on your Page"

The application connects to a user's Facebook Page(s) via Meta OAuth. Once connected, users can:

- **Publish content to Facebook Pages**: Users compose a message and optionally attach an image, then publish to their Page using `/{page-id}/feed` (text) or `/{page-id}/photos` (image posts).
- **Schedule content for Facebook Pages**: Same scheduling engine as Instagram — a server-side function publishes due posts to the Page at the scheduled time.
- **View Page engagement metrics**: The app reads basic engagement data (likes, comments, follower counts) to display analytics dashboards for connected Pages.

---

## 3. Permissions Requested

### Permissions included in this review

| Permission | Justification | Where used |
|---|---|---|
| `public_profile` | Required by Meta OAuth. Used to identify the authenticating user during the login flow. | `utils/meta-oauth.ts:13` — included in `META_SCOPE`; `app/api/auth/meta/callback/route.ts` — reads `/me` to identify user. |
| `pages_show_list` | Required to retrieve the list of Facebook Pages the user administers, so the user can select which Page to connect. | `app/api/auth/meta/callback/route.ts` — calls `GET /me/accounts` to list pages; `app/api/auth/social/connect/[platform]/route.ts:6`. |
| `pages_read_engagement` | Required to read engagement metrics (likes, comments, follower counts) on Facebook Page posts for the analytics dashboard. | `supabase/functions/sync-analytics/index.ts` — reads `/{post-id}/likes?summary=true`, `/{post-id}/comments?summary=true`, `/{page-id}?fields=fan_count,followers_count`; `lib/meta-api.ts` — `fetchFacebookPageInsights()`, `fetchFacebookPostInsights()`. |
| `pages_manage_posts` | Required to create posts on the user's Facebook Page (text and photo posts). | `utils/meta-publish.ts:66` — `POST /{page-id}/feed`; `utils/meta-publish.ts:116` — `POST /{page-id}/photos`; `supabase/functions/process-scheduled-posts/index.ts:29-35`. |
| `instagram_basic` | Required to read the Instagram Business account ID linked to a Facebook Page, and to read basic account information (follower counts, media count). | `app/api/auth/meta/callback/route.ts` — reads `/{page-id}?fields=instagram_business_account`; `supabase/functions/sync-analytics/index.ts` — reads `/{ig-user-id}?fields=followers_count,follows_count,media_count`. |
| `instagram_content_publish` | Required to publish image posts to the user's Instagram Business account via the two-step container flow. | `utils/meta-publish.ts:168` — `POST /{ig-user-id}/media` (create container); `utils/meta-publish.ts:196` — `POST /{ig-user-id}/media_publish`; `supabase/functions/process-scheduled-posts/index.ts:67-86`. |
| `instagram_manage_comments` | Required to read, reply to, and hide comments on the user's Instagram posts. | `supabase/functions/sync-comments/index.ts:83-97` — reads `/{media-id}/comments`; `app/api/posts-media/comments/route.ts` — reads comments for a selected post and sends `POST /{comment-id}/replies` + `POST /{comment-id}?hide=true` to Meta. |
| `instagram_manage_insights` | Required to read post-level and account-level Instagram metrics (likes, reach, saves, impressions) for the analytics dashboard. | `supabase/functions/sync-analytics/index.ts:127` — reads `/{media-id}?fields=like_count,comments_count`; `supabase/functions/sync-analytics/index.ts:147` — reads `/{media-id}/insights?metric=reach,saved,shares`; `lib/meta-api.ts` — `fetchInstagramInsights()`, `fetchInstagramPostInsights()`. |
| `instagram_manage_messages` | Required to read and reply to Instagram Direct Messages from the user's Instagram Business account. | `supabase/functions/sync-messages/index.ts:85-99` — fetches conversations via `GET /{page-id}/conversations?platform=instagram`; `app/api/messages/route.ts:171` — sends replies via `POST /{page-id}/messages`. |

**Total permissions for this submission: 9**

---

## 4. Data Handling & Storage

### 4.1 What data we store from Meta

| Data category | Source | Purpose |
|---|---|---|
| Page access tokens | OAuth callback (`/me/accounts`) | Authenticate API calls on behalf of the Page |
| Token expiration timestamps | Computed at OAuth (60-day window) | Track when re-authorization is needed |
| Facebook Page IDs and names | OAuth callback | Identify connected Pages |
| Instagram Business account IDs | OAuth callback (`/{page-id}?fields=instagram_business_account`) | Identify connected IG accounts |
| Published post IDs (platform_post_id) | Returned by publish API calls | Track which platform posts correspond to local posts |
| Post permalinks | Returned by IG `?fields=permalink` | Display links back to live posts |
| Comment IDs, author usernames, comment text | Fetched via `/{media-id}/comments` | Display and manage comments in-app |
| Post engagement metrics (likes, comments, shares, saves, reach) | Fetched via Graph API insights endpoints | Populate analytics dashboard |
| Account metrics (follower count, following count, media count) | Fetched via `/{ig-user-id}?fields=...` and `/{page-id}?fields=...` | Populate analytics dashboard |

### 4.2 Where data is stored (database tables)

All data is stored in a PostgreSQL database managed by Supabase.

| Table | Key columns | What it holds |
|---|---|---|
| `social_accounts` | `platform`, `account_id`, `account_name`, `access_token`, `refresh_token`, `token_expires_at`, `metadata` (JSONB) | OAuth tokens, connected Page/IG account identifiers. `metadata` contains `instagram_business_account_id` and `user_access_token`. |
| `posts` | `content`, `media_urls` (JSONB), `platforms` (JSONB), `status`, `scheduled_for`, `published_at` | User-authored post content and scheduling metadata. |
| `published_posts` | `post_id`, `platform`, `platform_post_id`, `permalink` | Maps local posts to their platform-side post IDs after publishing. |
| `comments` | `platform_comment_id`, `platform_post_id`, `author_username`, `message`, `is_hidden`, `replied_at`, `parent_comment_id` | Synced Instagram/Facebook comments, hide status, and reply tracking. |
| `post_analytics` | `published_post_id`, `views`, `likes`, `comments`, `shares`, `saves`, `engagement_rate`, `synced_at` | Per-post engagement metrics fetched from Graph API. |
| `account_analytics` | `social_account_id`, `date`, `followers`, `following`, `posts_count` | Daily account-level metrics for follower growth charts. |

Schema defined in: `supabase/migrations/20260101000000_initial_schema.sql`

### 4.3 Token lifecycle

1. **Initial authorization**: User clicks "Connect Facebook Pages" → redirected to Meta OAuth dialog (`https://www.facebook.com/v24.0/dialog/oauth`) — see `utils/meta-oauth.ts:6`.
2. **Code exchange**: Authorization code exchanged for a short-lived user token at `https://graph.facebook.com/v24.0/oauth/access_token` — see `utils/meta-oauth.ts:69-92`.
3. **Long-lived token exchange**: Short-lived token is immediately exchanged for a long-lived token (~60 days) via `grant_type=fb_exchange_token` — see `app/api/auth/social/callback/route.ts:40`.
4. **Page tokens**: After obtaining the user token, the callback fetches Page tokens via `GET /me/accounts`. Page tokens derived from long-lived user tokens are themselves long-lived. These are stored in `social_accounts.access_token`.
5. **Expiration tracking**: `token_expires_at` is set to `now + 60 days` and stored in the database — see `app/api/auth/meta/callback/route.ts:148`.
6. **Re-authorization**: There is no automatic token refresh. When a token expires, the user must re-connect via the OAuth flow. The UI provides a "Reconnect Pages" button — see `components/settings/connected-accounts.tsx`.
7. **Token storage**: Tokens are stored in the `social_accounts` table in Supabase PostgreSQL. Supabase encrypts data at rest. Tokens are never exposed to the client-side browser; all Graph API calls are made server-side (Next.js API routes or Supabase Edge Functions).

### 4.4 Data use confirmation

- We do **not** sell, license, or share Meta-sourced data with any third party.
- We do **not** use Meta data for advertising, profiling, or any purpose beyond providing the requested functionality to the authenticated user.
- Meta data is used solely to: publish content the user creates, display analytics the user requests, and manage comments the user interacts with.

---

## 5. Reviewer Test Instructions

### Prerequisites

- A Facebook Page that you administer.
- An Instagram Business or Creator account connected to that Facebook Page.
- At least one published Instagram post with comments (for testing comment management).

### Steps

1. **Sign up / Log in**
   - Navigate to `https://social.swiftdigital-s.com`.
   - Create an account using email/password or log in if you have test credentials.
   - You will be redirected to the dashboard after login.

2. **Connect Meta account**
   - Go to **Settings → Brand Profile → Connected Accounts** tab.
   - Click **"Connect Facebook Pages"**.
   - You will be redirected to Facebook's OAuth dialog. Log in with the test account and grant the requested permissions.
   - Select the Facebook Page(s) you want to connect. If the Page has a linked Instagram Business account, it will be connected automatically.
   - You will be redirected back to the app. The Connected Accounts section will show your Facebook Page and Instagram account as connected.

3. **Create a post (image + caption)**
   - Click the **"Create Post"** button (available from the dashboard or the floating action button).
   - In the post creation modal:
     - Select target platforms (Instagram and/or Facebook).
     - Write a caption (or use the AI assistant to help draft one — the AI only prepares text; the user reviews and approves before publishing).
     - Upload an image using the media upload area.
   - Choose **"Post Now"** to publish immediately.

4. **Publish immediately**
   - After clicking "Post Now", the app publishes to the selected platforms via the Meta Graph API.
   - A success or failure notification appears.
   - The post appears in the **Scheduled → Posted** tab with platform indicators.

5. **Schedule a post**
   - Create another post using the same modal.
   - Instead of "Post Now", select **"Schedule"** and pick a future date/time.
   - The post appears on the calendar view and in the Scheduled tab.
   - When the scheduled time arrives, the server-side edge function (`process-scheduled-posts`) automatically publishes the post. You can verify by checking the post status changes to "Published" after the scheduled time.

6. **Manage Instagram comments**
   - Navigate to **Posts** in the left sidebar.
   - Open any Instagram post that has comments and click the **Comments** action to open the comments drawer.
   - The app loads comments for that selected post from Meta and displays author username, comment text, replies, and timestamps.
   - **Reply**: Click **Reply** on a comment, type a response, and click **Send**. The reply is posted via the Graph API (`POST /{comment-id}/replies`).
   - **Hide**: Click the **Hide** (eye-off) action on a comment. The app hides the comment on Instagram via `POST /{comment-id}?hide=true`.

---

## 6. Screencast Script

**Duration**: 2:30 — 3:00

---

**[00:00 — 00:15] Introduction**

"This screencast demonstrates Swift Digital Sol Social, a social media management platform. I will walk through each feature that requires the Meta permissions we have requested."

---

**[00:15 — 00:45] Connecting a Meta account**

"I am on the Settings page, under Connected Accounts. I click Connect Facebook Pages. This redirects to Facebook's OAuth dialog."

"The app requests these permissions: `pages_show_list` to list my Pages, `pages_read_engagement` to read engagement data, `pages_manage_posts` to publish content, `instagram_basic` to access my Instagram Business account, `instagram_content_publish` to publish to Instagram, `instagram_manage_comments` to manage comments, and `instagram_manage_insights` to read analytics."

"I authorize the app and select my Page. I am redirected back. Both my Facebook Page and Instagram Business account now appear as connected."

"This permission is used here: `pages_show_list` retrieves the Page list. `instagram_basic` detects the linked Instagram Business account."

---

**[00:45 — 01:30] Publishing a post**

"I click Create Post. I select both Instagram and Facebook as target platforms. I type a caption and upload an image."

"I click Post Now. The app publishes to Facebook using `pages_manage_posts` — specifically a POST request to the Page's /photos endpoint. For Instagram, it uses `instagram_content_publish` — creating a media container and then publishing it."

"This permission is used here: `pages_manage_posts` creates the Facebook Page post. `instagram_content_publish` creates and publishes the Instagram post."

"The post now appears in my Posted tab with links to both platforms."

---

**[01:30 — 02:00] Scheduling a post**

"I create another post, but this time I select Schedule and set a date for tomorrow at 10 AM. The post appears on the calendar."

"When the scheduled time arrives, our server-side function automatically publishes the post using the same permissions: `pages_manage_posts` for Facebook and `instagram_content_publish` for Instagram."

---

**[02:00 — 02:40] Managing Instagram comments**

"I navigate to the Posts section, open a post, and open the comments drawer. The app fetches comments for that selected Instagram post."

"This permission is used here: `instagram_manage_comments` is used to read comments via GET /{media-id}/comments."

"I reply to a comment by typing a response and clicking Send. This uses `instagram_manage_comments` to POST to /{comment-id}/replies."

"I hide an unwanted comment by clicking the hide icon. This uses `instagram_manage_comments` to POST /{comment-id}?hide=true."

---

**[02:40 — 02:55] Analytics**

"I open the Analytics page. The app displays follower counts and post engagement metrics."

"This permission is used here: `pages_read_engagement` reads Facebook Page metrics. `instagram_manage_insights` reads Instagram reach, impressions, and saves."

---

**[02:55 — 03:00] Closing**

"That concludes the demonstration. Each permission maps to a specific, user-initiated action within the platform. Thank you."

---

## 7. Compliance Notes / "What We Do Not Do"

- We do **not** request or access Facebook user profile data beyond `public_profile` (name and ID for login identification). We do not read the user's personal timeline, friends list, or private information.
- We do **not** scrape, crawl, or programmatically collect personal data from any Meta platform.
- We do **not** automate engagement actions (auto-liking, auto-following, auto-commenting). All comment replies and post publications are explicitly initiated by the user.
- We only access and act upon **business assets** (Facebook Pages and Instagram Business accounts) that the user explicitly authorizes during the OAuth flow.
- The AI assistant feature is used solely for **content preparation** — it helps the user draft captions and ideas. The AI does not autonomously publish, comment, or interact with Meta APIs. All AI-generated content is reviewed and approved by the user before any API call is made.
- We do **not** store or process Meta data for purposes unrelated to the functionality the user has requested.
- We do **not** share Meta-sourced data with third parties, advertisers, or data brokers.

---

## 8. URLs & Contact

| Item | Value |
|---|---|
| App website | https://social.swiftdigital-s.com |
| Privacy Policy | https://social.swiftdigital-s.com/privacy |
| Terms of Service | https://social.swiftdigital-s.com/terms |
| Support email | info@swiftdigital-s.com |
| Business portfolio | Swift Digital Solutions (verified) |

---

## Appendix: Environment Variables (redacted)

The following environment variables are required for Meta integration. Secrets are redacted.

```
NEXT_PUBLIC_META_APP_ID=<Meta App ID>
META_APP_SECRET=<Meta App Secret — server-side only>
FACEBOOK_CLIENT_ID=<same as Meta App ID — legacy alias>
FACEBOOK_CLIENT_SECRET=<same as Meta App Secret — legacy alias>
NEXT_PUBLIC_APP_URL=https://social.swiftdigital-s.com
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
SUPABASE_SERVICE_KEY=<Supabase service role key — server-side only>
```

Configuration files: `env.example`, `.env.vercel.example`
