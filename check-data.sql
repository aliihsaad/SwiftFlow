-- Quick check of your data

-- 1. Count posts by status
SELECT status, COUNT(*) FROM posts GROUP BY status;

-- 2. Show all posts
SELECT id, status, published_at, LEFT(content, 50) as content_preview
FROM posts
ORDER BY created_at DESC
LIMIT 10;

-- 3. Show published_posts
SELECT * FROM published_posts ORDER BY published_at DESC LIMIT 10;

-- 4. Show social_accounts
SELECT id, platform, account_name FROM social_accounts;
