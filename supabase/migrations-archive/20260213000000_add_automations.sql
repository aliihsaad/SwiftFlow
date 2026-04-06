-- Add automations table for auto-DM feature
CREATE TABLE IF NOT EXISTS automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'comment_to_dm',
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,

    -- Target post
    platform_post_id TEXT NOT NULL,
    post_thumbnail_url TEXT,
    post_caption TEXT,

    -- Trigger config: { trigger_type: "any_comment"|"keywords", keywords: [] }
    trigger_config JSONB NOT NULL DEFAULT '{"trigger_type": "any_comment", "keywords": []}',

    -- Comment reply: { enabled: false, messages: ["Check DMs!"] }
    comment_reply_config JSONB DEFAULT '{"enabled": false, "messages": []}',

    -- DM config: { opening_message: "", button_text: "", link_url: "", link_message: "" }
    dm_config JSONB NOT NULL,

    -- Stats
    total_triggered INTEGER DEFAULT 0,
    total_dms_sent INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add automation_logs table for tracking processed comments
CREATE TABLE IF NOT EXISTS automation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID REFERENCES automations(id) ON DELETE CASCADE,
    trigger_comment_id TEXT NOT NULL,
    commenter_id TEXT NOT NULL,
    commenter_username TEXT,
    comment_reply_sent BOOLEAN DEFAULT false,
    dm_sent BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    triggered_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(automation_id, trigger_comment_id)
);

-- Indexes for automations
CREATE INDEX IF NOT EXISTS idx_automations_workspace ON automations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_automations_social_account ON automations(social_account_id);
CREATE INDEX IF NOT EXISTS idx_automations_platform_post ON automations(platform_post_id);
CREATE INDEX IF NOT EXISTS idx_automations_active ON automations(is_active) WHERE is_active = true;

-- Indexes for automation_logs
CREATE INDEX IF NOT EXISTS idx_automation_logs_automation ON automation_logs(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_status ON automation_logs(status);
CREATE INDEX IF NOT EXISTS idx_automation_logs_triggered_at ON automation_logs(triggered_at);

-- Enable RLS
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for automations
CREATE POLICY "Users can view automations in their workspaces"
    ON automations FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create automations in their workspaces"
    ON automations FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update automations in their workspaces"
    ON automations FOR UPDATE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete automations in their workspaces"
    ON automations FOR DELETE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for automation_logs
CREATE POLICY "Users can view automation logs in their workspaces"
    ON automation_logs FOR SELECT
    USING (
        automation_id IN (
            SELECT id FROM automations
            WHERE workspace_id IN (
                SELECT workspace_id FROM workspace_members
                WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can create automation logs"
    ON automation_logs FOR INSERT
    WITH CHECK (
        automation_id IN (
            SELECT id FROM automations
            WHERE workspace_id IN (
                SELECT workspace_id FROM workspace_members
                WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can update automation logs"
    ON automation_logs FOR UPDATE
    USING (
        automation_id IN (
            SELECT id FROM automations
            WHERE workspace_id IN (
                SELECT workspace_id FROM workspace_members
                WHERE user_id = auth.uid()
            )
        )
    );

-- Grant service role full access for edge functions
CREATE POLICY "Service role has full access to automations"
    ON automations FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role has full access to automation_logs"
    ON automation_logs FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant table permissions
GRANT ALL ON TABLE automations TO authenticated;
GRANT ALL ON TABLE automation_logs TO authenticated;
GRANT SELECT ON TABLE automations TO anon;
GRANT SELECT ON TABLE automation_logs TO anon;
