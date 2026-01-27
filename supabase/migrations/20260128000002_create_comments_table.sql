-- Create comments table for managing social media comments
-- Supports both Instagram and Facebook comments with threading

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    published_post_id UUID REFERENCES published_posts(id) ON DELETE CASCADE,
    platform_comment_id TEXT NOT NULL,
    platform_post_id TEXT NOT NULL,
    parent_comment_id UUID REFERENCES comments(id),
    author_id TEXT,
    author_username TEXT,
    author_profile_picture TEXT,
    message TEXT NOT NULL,
    is_hidden BOOLEAN DEFAULT FALSE,
    replied_at TIMESTAMPTZ,
    platform_created_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workspace_id, platform_comment_id)
);

-- Indexes for efficient querying
CREATE INDEX idx_comments_workspace ON comments(workspace_id);
CREATE INDEX idx_comments_social_account ON comments(social_account_id);
CREATE INDEX idx_comments_published_post ON comments(published_post_id);
CREATE INDEX idx_comments_platform_created ON comments(platform_created_at DESC);
CREATE INDEX idx_comments_parent ON comments(parent_comment_id);

-- Enable RLS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view comments in their workspace"
    ON comments FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert comments in their workspace"
    ON comments FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update comments in their workspace"
    ON comments FOR UPDATE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete comments in their workspace"
    ON comments FOR DELETE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );
