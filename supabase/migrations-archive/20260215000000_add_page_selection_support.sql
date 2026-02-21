-- Migration: Add page selection support
-- 1. Create oauth_page_sessions table for temporary storage during page selection
-- 2. Add unique constraint on social_accounts (workspace_id, platform)

-- Temporary table to hold page data between OAuth callback and user selection
CREATE TABLE IF NOT EXISTS oauth_page_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_access_token TEXT NOT NULL,
    pages_data JSONB NOT NULL DEFAULT '[]',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-cleanup: allow RLS bypass for service role (this table is only used server-side)
ALTER TABLE oauth_page_sessions ENABLE ROW LEVEL SECURITY;

-- Clean up duplicate social accounts per workspace+platform (keep the most recently updated)
-- This is needed before adding the unique constraint
DELETE FROM social_accounts a
USING social_accounts b
WHERE a.workspace_id = b.workspace_id
  AND a.platform = b.platform
  AND a.id <> b.id
  AND a.updated_at < b.updated_at;

-- Add unique constraint: 1 account per platform per workspace
ALTER TABLE social_accounts
ADD CONSTRAINT social_accounts_workspace_platform_unique
UNIQUE (workspace_id, platform);
