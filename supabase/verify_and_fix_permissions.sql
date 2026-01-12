-- First, let's check the current RLS status
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own workspaces" ON workspaces;
DROP POLICY IF EXISTS "Users can insert their own workspaces" ON workspaces;
DROP POLICY IF EXISTS "Users can update their own workspaces" ON workspaces;
DROP POLICY IF EXISTS "Users can view social accounts via workspace" ON social_accounts;
DROP POLICY IF EXISTS "Users can view posts via workspace" ON posts;

-- Disable RLS on all tables
ALTER TABLE IF EXISTS workspaces DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS social_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS posts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS published_posts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS post_analytics DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS account_analytics DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS generated_images DISABLE ROW LEVEL SECURITY;

-- Grant full access to service_role explicitly
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Also grant to authenticated users (for regular client operations)
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Verify the changes
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
