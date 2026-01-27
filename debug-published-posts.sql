-- Debug: Check published posts

-- 1. Count posts by status
SELECT status, COUNT(*) as count
FROM posts
GROUP BY status;

-- 2. Get all published posts
SELECT
    id,
    content,
    status,
    published_at,
    created_at
FROM posts
WHERE status = 'published'
ORDER BY published_at DESC
LIMIT 10;

-- 3. Check published_posts table
SELECT
    pp.id,
    pp.platform,
    pp.platform_post_id,
    pp.published_at,
    p.content,
    p.status
FROM published_posts pp
LEFT JOIN posts p ON p.id = pp.post_id
ORDER BY pp.published_at DESC
LIMIT 10;

-- 4. Check if there are any post_analytics
SELECT
    pa.*,
    pp.platform,
    pp.platform_post_id
FROM post_analytics pa
JOIN published_posts pp ON pp.id = pa.published_post_id
ORDER BY pa.synced_at DESC
LIMIT 10;

-- 5. Test the query from the app
SELECT
    p.*,
    pp.id as published_post_id,
    pp.platform,
    pp.platform_post_id,
    pa.views,
    pa.likes,
    pa.comments,
    pa.shares
FROM posts p
LEFT JOIN published_posts pp ON pp.post_id = p.id
LEFT JOIN post_analytics pa ON pa.published_post_id = pp.id
WHERE p.status = 'published'
ORDER BY p.published_at DESC
LIMIT 10;
