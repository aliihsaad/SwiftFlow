-- Add UNIQUE constraint to published_post_id in post_analytics table
-- This is required for the upsert operation in sync-analytics function

-- First, remove any duplicate rows if they exist
DELETE FROM post_analytics a USING post_analytics b
WHERE a.id > b.id
AND a.published_post_id = b.published_post_id;

-- Add the UNIQUE constraint
ALTER TABLE post_analytics
ADD CONSTRAINT post_analytics_published_post_id_key
UNIQUE (published_post_id);

-- Also make the column NOT NULL since it should always be set
ALTER TABLE post_analytics
ALTER COLUMN published_post_id SET NOT NULL;
