-- Enforce global uniqueness: one account_id per platform across all workspaces.
-- This prevents the same FB page / IG account from being connected in multiple workspaces,
-- which simplifies webhook routing (single-target resolution).

-- First, clean up any existing duplicates (keep the most-recently-updated row)
DELETE FROM social_accounts
WHERE id NOT IN (
    SELECT DISTINCT ON (platform, account_id) id
    FROM social_accounts
    ORDER BY platform, account_id, updated_at DESC NULLS LAST
);

-- Add the unique constraint
ALTER TABLE social_accounts
ADD CONSTRAINT social_accounts_platform_account_id_unique
UNIQUE (platform, account_id);
