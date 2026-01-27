-- Fix posts.published_at by copying from published_posts.published_at
-- Run this in your Supabase SQL Editor

-- First, let's see which posts need fixing
SELECT
    p.id,
    p.status,
    p.published_at AS posts_published_at,
    pp.published_at AS published_posts_published_at
FROM posts p
JOIN published_posts pp ON pp.post_id = p.id
WHERE p.status = 'published'
  AND p.published_at IS NULL;

-- Update posts.published_at from the earliest published_posts.published_at
UPDATE posts p
SET published_at = (
    SELECT MIN(pp.published_at)
    FROM published_posts pp
    WHERE pp.post_id = p.id
)
WHERE p.status = 'published'
  AND p.published_at IS NULL
  AND EXISTS (
    SELECT 1 FROM published_posts pp WHERE pp.post_id = p.id
  );

-- Verify the fix worked
SELECT
    p.id,
    p.status,
    p.published_at,
    COUNT(pp.id) AS published_posts_count
FROM posts p
LEFT JOIN published_posts pp ON pp.post_id = p.id
WHERE p.status = 'published'
GROUP BY p.id, p.status, p.published_at
ORDER BY p.published_at DESC;
