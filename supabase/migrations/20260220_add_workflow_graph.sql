-- Add workflow graph and editor version columns to automations
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS workflow_graph JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS editor_version TEXT DEFAULT 'wizard';

-- Scheduled executions table for delay nodes
CREATE TABLE IF NOT EXISTS automation_scheduled_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL,
  node_id TEXT NOT NULL,
  execution_context JSONB NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  executed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_exec_pending
  ON automation_scheduled_executions(scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_exec_automation
  ON automation_scheduled_executions(automation_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_exec_status
  ON automation_scheduled_executions(status);

-- Enable RLS
ALTER TABLE automation_scheduled_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users (matching existing pattern)
CREATE POLICY "Users can view scheduled executions in their workspaces"
  ON automation_scheduled_executions FOR SELECT
  USING (
    automation_id IN (
      SELECT id FROM automations
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create scheduled executions in their workspaces"
  ON automation_scheduled_executions FOR INSERT
  WITH CHECK (
    automation_id IN (
      SELECT id FROM automations
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update scheduled executions in their workspaces"
  ON automation_scheduled_executions FOR UPDATE
  USING (
    automation_id IN (
      SELECT id FROM automations
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete scheduled executions in their workspaces"
  ON automation_scheduled_executions FOR DELETE
  USING (
    automation_id IN (
      SELECT id FROM automations
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Service role full access (for edge functions) — matching existing pattern
CREATE POLICY "Service role has full access to scheduled executions"
  ON automation_scheduled_executions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant table permissions (matching existing pattern)
GRANT ALL ON TABLE automation_scheduled_executions TO authenticated;
GRANT ALL ON TABLE automation_scheduled_executions TO service_role;
GRANT SELECT ON TABLE automation_scheduled_executions TO anon;
