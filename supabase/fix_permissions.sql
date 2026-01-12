-- Enable RLS for all tables (if not already)
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;

-- POSTS Policies
CREATE POLICY "Users can insert posts via workspace" ON posts FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspaces 
    WHERE id = posts.workspace_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can update posts via workspace" ON posts FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM workspaces 
    WHERE id = posts.workspace_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete posts via workspace" ON posts FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM workspaces 
    WHERE id = posts.workspace_id 
    AND user_id = auth.uid()
  )
);

-- SOCIAL ACCOUNTS Policies
CREATE POLICY "Users can insert social accounts via workspace" ON social_accounts FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspaces 
    WHERE id = social_accounts.workspace_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can update social accounts via workspace" ON social_accounts FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM workspaces 
    WHERE id = social_accounts.workspace_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete social accounts via workspace" ON social_accounts FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM workspaces 
    WHERE id = social_accounts.workspace_id 
    AND user_id = auth.uid()
  )
);
