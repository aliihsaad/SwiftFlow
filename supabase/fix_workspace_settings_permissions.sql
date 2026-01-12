-- Fix permissions for workspace_settings table

-- 1. Grant access to authenticated users and service_role
GRANT ALL ON workspace_settings TO authenticated;
GRANT ALL ON workspace_settings TO service_role;

-- 2. Enable RLS to ensure data isolation
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can read workspace settings" ON workspace_settings;
DROP POLICY IF EXISTS "Workspace owners can update settings" ON workspace_settings;
DROP POLICY IF EXISTS "Workspace owners can insert settings" ON workspace_settings;
DROP POLICY IF EXISTS "Workspace owners can delete settings" ON workspace_settings;

-- 4. Re-create policies

-- Policy: Users can read settings for workspaces they're members of
CREATE POLICY "Users can read workspace settings"
ON workspace_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_settings.workspace_id
    AND workspace_members.user_id = auth.uid()
  )
);

-- Policy: Only workspace owners can update settings
CREATE POLICY "Workspace owners can update settings"
ON workspace_settings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_settings.workspace_id
    AND workspace_members.user_id = auth.uid()
    AND workspace_members.role = 'owner'
  )
);

-- Policy: Only workspace owners can insert settings
CREATE POLICY "Workspace owners can insert settings"
ON workspace_settings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_settings.workspace_id
    AND workspace_members.user_id = auth.uid()
    AND workspace_members.role = 'owner'
  )
);

-- Policy: Only workspace owners can delete settings
CREATE POLICY "Workspace owners can delete settings"
ON workspace_settings
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_settings.workspace_id
    AND workspace_members.user_id = auth.uid()
    AND workspace_members.role = 'owner'
  )
);
