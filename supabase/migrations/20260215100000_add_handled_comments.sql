-- Add processed_comments table for tracking automation-processed comments
-- This prevents duplicate processing of the same comment across automation runs

CREATE TABLE IF NOT EXISTS processed_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    comment_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(automation_id, comment_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_processed_comments_automation ON processed_comments(automation_id);
CREATE INDEX IF NOT EXISTS idx_processed_comments_workspace ON processed_comments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_processed_comments_comment ON processed_comments(comment_id);

-- Enable RLS
ALTER TABLE processed_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view processed comments in their workspaces"
    ON processed_comments FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create processed comments in their workspaces"
    ON processed_comments FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid()
        )
    );

-- Service role full access (for edge functions)
CREATE POLICY "Service role has full access to processed_comments"
    ON processed_comments FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant permissions
GRANT ALL ON TABLE processed_comments TO authenticated;
GRANT ALL ON TABLE processed_comments TO service_role;
