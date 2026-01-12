-- Fix Trigger and RLS for automatic settings creation

-- 1. Update the Trigger Function to be SECURITY DEFINER
-- This ensures the function runs with the privileges of the database owner (bypassing RLS)
-- rather than the user who triggered it. This is crucial because the user
-- is not yet a member of the workspace when this trigger fires.
CREATE OR REPLACE FUNCTION create_default_workspace_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workspace_settings (workspace_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update the INSERT policy for workspace_settings to be more robust
-- Instead of checking workspace_members (which doesn't exist yet during creation),
-- check the workspaces table directly to see if the user is the owner.
DROP POLICY IF EXISTS "Workspace owners can insert settings" ON workspace_settings;

CREATE POLICY "Workspace owners can insert settings"
ON workspace_settings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspaces
    WHERE id = workspace_settings.workspace_id
    AND owner_id = auth.uid()
  )
);
