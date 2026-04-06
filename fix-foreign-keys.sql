-- Fix missing foreign key relationships for PostgREST
-- Run this in your Supabase SQL Editor

-- 1. First, check if the foreign key exists
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'published_posts';

-- 2. Drop and recreate the foreign key to ensure it's properly set up
ALTER TABLE published_posts
DROP CONSTRAINT IF EXISTS published_posts_post_id_fkey;

ALTER TABLE published_posts
ADD CONSTRAINT published_posts_post_id_fkey
FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

-- 3. Also fix post_analytics foreign key
ALTER TABLE post_analytics
DROP CONSTRAINT IF EXISTS post_analytics_published_post_id_fkey;

ALTER TABLE post_analytics
ADD CONSTRAINT post_analytics_published_post_id_fkey
FOREIGN KEY (published_post_id) REFERENCES published_posts(id) ON DELETE CASCADE;

-- 4. Reload PostgREST schema cache (this happens automatically but let's verify)
NOTIFY pgrst, 'reload schema';

-- 5. Verify the relationships now exist
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND (tc.table_name = 'published_posts' OR tc.table_name = 'post_analytics');
