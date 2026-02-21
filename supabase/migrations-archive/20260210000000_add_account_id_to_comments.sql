-- Add account_id column to comments table
-- This stores the platform's account ID (e.g., Instagram business account ID)
-- for easier querying without needing to join with social_accounts

ALTER TABLE comments ADD COLUMN IF NOT EXISTS account_id TEXT;

-- Add index for efficient querying by account_id
CREATE INDEX IF NOT EXISTS idx_comments_account_id ON comments(account_id);

-- Backfill existing comments with account_id from social_accounts
UPDATE comments c
SET account_id = sa.account_id
FROM social_accounts sa
WHERE c.social_account_id = sa.id
AND c.account_id IS NULL;
