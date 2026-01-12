-- 1. Reset RLS for Workspaces
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own workspaces" ON workspaces;
DROP POLICY IF EXISTS "Users can insert their own workspaces" ON workspaces;
DROP POLICY IF EXISTS "Users can update their own workspaces" ON workspaces;

-- Allow users to see workspaces where they are the owner
CREATE POLICY "Users can view their own workspaces" ON workspaces FOR SELECT USING (auth.uid() = user_id);

-- Allow users to create a workspace (checking that they assign it to themselves)
CREATE POLICY "Users can insert their own workspaces" ON workspaces FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own workspaces
CREATE POLICY "Users can update their own workspaces" ON workspaces FOR UPDATE USING (auth.uid() = user_id);


-- 2. Reset RLS for Posts
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view posts via workspace" ON posts;
DROP POLICY IF EXISTS "Users can insert posts via workspace" ON posts;
DROP POLICY IF EXISTS "Users can update posts via workspace" ON posts;
DROP POLICY IF EXISTS "Users can delete posts via workspace" ON posts;

CREATE POLICY "Users can view posts via workspace" ON posts FOR SELECT USING (
  EXISTS (SELECT 1 FROM workspaces WHERE id = posts.workspace_id AND user_id = auth.uid())
);

CREATE POLICY "Users can insert posts via workspace" ON posts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM workspaces WHERE id = posts.workspace_id AND user_id = auth.uid())
);

CREATE POLICY "Users can update posts via workspace" ON posts FOR UPDATE USING (
  EXISTS (SELECT 1 FROM workspaces WHERE id = posts.workspace_id AND user_id = auth.uid())
);

CREATE POLICY "Users can delete posts via workspace" ON posts FOR DELETE USING (
  EXISTS (SELECT 1 FROM workspaces WHERE id = posts.workspace_id AND user_id = auth.uid())
);


-- 3. Reset RLS for Social Accounts
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view social accounts via workspace" ON social_accounts;
DROP POLICY IF EXISTS "Users can insert social accounts via workspace" ON social_accounts;
DROP POLICY IF EXISTS "Users can update social accounts via workspace" ON social_accounts;
DROP POLICY IF EXISTS "Users can delete social accounts via workspace" ON social_accounts;

CREATE POLICY "Users can view social accounts via workspace" ON social_accounts FOR SELECT USING (
  EXISTS (SELECT 1 FROM workspaces WHERE id = social_accounts.workspace_id AND user_id = auth.uid())
);

CREATE POLICY "Users can insert social accounts via workspace" ON social_accounts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM workspaces WHERE id = social_accounts.workspace_id AND user_id = auth.uid())
);

CREATE POLICY "Users can update social accounts via workspace" ON social_accounts FOR UPDATE USING (
  EXISTS (SELECT 1 FROM workspaces WHERE id = social_accounts.workspace_id AND user_id = auth.uid())
);

CREATE POLICY "Users can delete social accounts via workspace" ON social_accounts FOR DELETE USING (
  EXISTS (SELECT 1 FROM workspaces WHERE id = social_accounts.workspace_id AND user_id = auth.uid())
);
