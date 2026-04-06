-- Add 'publishing' to allowed post statuses to support atomic locking
-- This prevents duplicate publishing by using 'publishing' as a lock state

-- Drop the existing constraint
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check;

-- Add the updated constraint with 'publishing' included
ALTER TABLE posts ADD CONSTRAINT posts_status_check
  CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed'));
