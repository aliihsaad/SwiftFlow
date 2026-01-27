-- Run this in your Supabase SQL Editor to fix the post_analytics table
-- This adds the UNIQUE constraint needed for the sync to work

BEGIN;

-- Remove any duplicate rows if they exist
DELETE FROM post_analytics a USING post_analytics b
WHERE a.id > b.id
AND a.published_post_id = b.published_post_id;

-- Add the UNIQUE constraint
ALTER TABLE post_analytics
DROP CONSTRAINT IF EXISTS post_analytics_published_post_id_key;

ALTER TABLE post_analytics
ADD CONSTRAINT post_analytics_published_post_id_key
UNIQUE (published_post_id);

-- Make the column NOT NULL
ALTER TABLE post_analytics
ALTER COLUMN published_post_id SET NOT NULL;

COMMIT;

-- Verify the constraint was added
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'post_analytics'
    AND tc.constraint_type = 'UNIQUE';
