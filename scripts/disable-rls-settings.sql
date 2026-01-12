-- Disable RLS on workspace_settings table
ALTER TABLE workspace_settings DISABLE ROW LEVEL SECURITY;

-- Drop all policies if they exist
DROP POLICY IF EXISTS "Users can read workspace settings" ON workspace_settings;
DROP POLICY IF EXISTS "Workspace owners can update settings" ON workspace_settings;
DROP POLICY IF EXISTS "Workspace owners can insert settings" ON workspace_settings;
DROP POLICY IF EXISTS "Workspace owners can delete settings" ON workspace_settings;

-- Verify RLS is disabled
SELECT
    tablename,
    rowsecurity as "RLS Enabled"
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'workspace_settings';
