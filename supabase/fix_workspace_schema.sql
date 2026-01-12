-- Fix User/Owner ID mismatch
DO $$ 
BEGIN
    -- Rename user_id to owner_id if user_id exists and owner_id does not
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspaces' AND column_name = 'user_id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspaces' AND column_name = 'owner_id') THEN
        ALTER TABLE workspaces RENAME COLUMN user_id TO owner_id;
    END IF;
END $$;

-- Add slug if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspaces' AND column_name = 'slug') THEN
        ALTER TABLE workspaces ADD COLUMN slug TEXT;
        -- Generate temporary slugs for existing rows to avoid NOT NULL violation if we enforce it
        UPDATE workspaces SET slug = LOWER(REPLACE(name, ' ', '-')) || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6) WHERE slug IS NULL;
        ALTER TABLE workspaces ALTER COLUMN slug SET NOT NULL;
        ALTER TABLE workspaces ADD CONSTRAINT workspaces_slug_key UNIQUE (slug);
    END IF;
END $$;

-- Ensure Workspace Members Table exists (it might not if the previous CREATE IF NOT EXISTS skipped it but permissions failed etc, but likely it just didn't exist or was created fine. Rethinking: existing schema.sql didn't have it.)
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- Backfill owner as a member if not present using the new owner_id column
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT id, owner_id, 'owner'
FROM workspaces
WHERE NOT EXISTS (
    SELECT 1 FROM workspace_members 
    WHERE workspace_members.workspace_id = workspaces.id 
    AND workspace_members.user_id = workspaces.owner_id
);

-- Ensure Social Connections Table exists
CREATE TABLE IF NOT EXISTS social_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  account_name TEXT NOT NULL,
  account_id TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update Posts to ensure workspace_id exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'workspace_id') THEN
        ALTER TABLE posts ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Grant permissions (just in case)
GRANT ALL ON workspaces TO authenticated;
GRANT ALL ON workspace_members TO authenticated;
GRANT ALL ON social_connections TO authenticated;
GRANT ALL ON posts TO authenticated;
