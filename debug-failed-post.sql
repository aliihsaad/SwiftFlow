-- Run this in Supabase SQL Editor to debug the failed post

-- 1. Check the failed post details
SELECT
    id,
    workspace_id,
    content,
    media_urls,
    platforms,
    scheduled_for,
    status,
    published_at
FROM posts
WHERE status = 'failed'
ORDER BY updated_at DESC
LIMIT 5;

-- 2. Check if you have social accounts connected
SELECT
    id,
    workspace_id,
    platform,
    account_name,
    account_id,
    token_expires_at,
    CASE
        WHEN access_token IS NOT NULL THEN 'Has token'
        ELSE 'No token'
    END as token_status
FROM social_accounts
ORDER BY created_at DESC;

-- 3. Check if there are any published_posts records (partial success)
SELECT
    pp.id,
    pp.platform,
    pp.platform_post_id,
    pp.published_at,
    p.status as post_status
FROM published_posts pp
JOIN posts p ON p.id = pp.post_id
ORDER BY pp.published_at DESC
LIMIT 5;
