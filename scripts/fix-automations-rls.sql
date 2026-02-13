-- Run this in your Supabase Dashboard SQL Editor
-- Dashboard -> SQL Editor -> New Query

-- Drop existing policies if they exist (to recreate them cleanly)
DROP POLICY IF EXISTS "Users can view automations in their workspaces" ON automations;
DROP POLICY IF EXISTS "Users can create automations in their workspaces" ON automations;
DROP POLICY IF EXISTS "Users can update automations in their workspaces" ON automations;
DROP POLICY IF EXISTS "Users can delete automations in their workspaces" ON automations;
DROP POLICY IF EXISTS "Service role has full access to automations" ON automations;

DROP POLICY IF EXISTS "Users can view automation logs in their workspaces" ON automation_logs;
DROP POLICY IF EXISTS "Users can create automation logs" ON automation_logs;
DROP POLICY IF EXISTS "Users can update automation logs" ON automation_logs;
DROP POLICY IF EXISTS "Service role has full access to automation_logs" ON automation_logs;

-- Ensure RLS is enabled
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

-- Grant table permissions to authenticated users
GRANT ALL ON TABLE automations TO authenticated;
GRANT ALL ON TABLE automation_logs TO authenticated;
GRANT SELECT ON TABLE automations TO anon;
GRANT SELECT ON TABLE automation_logs TO anon;
