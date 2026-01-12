-- Fix for infinite recursion by using a SECURITY DEFINER function

-- 1. Create Helper Function
-- This function bypasses RLS because it is SECURITY DEFINER.
-- It breaks the recursion chain when policies need to check membership.
CREATE OR REPLACE FUNCTION is_member_of(_workspace_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM workspace_members 
        WHERE workspace_id = _workspace_id 
        AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update Policies

-- Workspace Members
DROP POLICY IF EXISTS "View members" ON workspace_members;
CREATE POLICY "View members" ON workspace_members FOR SELECT USING (
    user_id = auth.uid() OR is_member_of(workspace_id)
);

-- Workspaces
DROP POLICY IF EXISTS "View workspaces" ON workspaces;
CREATE POLICY "View workspaces" ON workspaces FOR SELECT USING (
    auth.uid() = owner_id OR is_member_of(id)
);

-- Settings
DROP POLICY IF EXISTS "Member access settings" ON workspace_settings;
CREATE POLICY "Member access settings" ON workspace_settings FOR ALL USING (
    is_member_of(workspace_id)
);

-- Social Accounts
DROP POLICY IF EXISTS "Member access social_accounts" ON social_accounts;
CREATE POLICY "Member access social_accounts" ON social_accounts FOR ALL USING (
    is_member_of(workspace_id)
);

-- Posts
DROP POLICY IF EXISTS "Member access posts" ON posts;
CREATE POLICY "Member access posts" ON posts FOR ALL USING (
    is_member_of(workspace_id)
);

-- Analytics
DROP POLICY IF EXISTS "Member access analytics" ON analytics_snapshots;
CREATE POLICY "Member access analytics" ON analytics_snapshots FOR ALL USING (
    is_member_of(workspace_id)
);
