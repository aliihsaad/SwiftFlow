-- Fix workspace creation permissions

-- 1. Enable RLS on Workspace Members
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- 2. Allow users to insert themselves as 'owner' if they own the workspace
-- This is critical for the "Create Workspace" flow where the user creates a workspace (becoming owner)
-- and then immediately adds themselves as the first member.
CREATE POLICY "Users can add themself as owner" ON workspace_members
FOR INSERT WITH CHECK (
    auth.uid() = user_id 
    AND role = 'owner'
    AND EXISTS (
        SELECT 1 FROM workspaces 
        WHERE id = workspace_id 
        AND owner_id = auth.uid()
    )
);

-- 3. Allow workspace owners to delete their workspaces
-- This is needed for cleanup if membership creation fails, and for general workspace management.
CREATE POLICY "Users can delete their own workspaces" ON workspaces
FOR DELETE
USING (
    auth.uid() = owner_id
);

-- 4. Verify/Ensure other necessary policies exist (safe to re-run or ignore if exists)
-- Ensure users can create workspaces
DROP POLICY IF EXISTS "Users can create workspaces" ON workspaces;
CREATE POLICY "Users can create workspaces" ON workspaces
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
