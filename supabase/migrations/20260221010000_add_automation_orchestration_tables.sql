-- Orchestration tables for canvas automation execution pipeline
-- This separates event ingestion, run lifecycle, and per-node execution logs.

CREATE TABLE IF NOT EXISTS automation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_key TEXT,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'webhook',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'queued', 'processed', 'ignored', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_events_unique_key
  ON automation_events(workspace_id, event_key)
  WHERE event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automation_events_workspace_created
  ON automation_events(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_events_status
  ON automation_events(status);

CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES automation_events(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'skipped')),
  trigger_type TEXT,
  trigger_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  node_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_count INTEGER NOT NULL DEFAULT 0,
  dms_sent_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_workspace_created
  ON automation_runs(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_runs_automation
  ON automation_runs(automation_id);

CREATE INDEX IF NOT EXISTS idx_automation_runs_event
  ON automation_runs(event_id);

CREATE INDEX IF NOT EXISTS idx_automation_runs_status
  ON automation_runs(status);

CREATE TABLE IF NOT EXISTS automation_node_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'skipped')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(run_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_node_runs_run
  ON automation_node_runs(run_id);

CREATE INDEX IF NOT EXISTS idx_automation_node_runs_automation
  ON automation_node_runs(automation_id);

CREATE INDEX IF NOT EXISTS idx_automation_node_runs_workspace_created
  ON automation_node_runs(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_node_runs_status
  ON automation_node_runs(status);

ALTER TABLE automation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_node_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view automation events in their workspaces"
  ON automation_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view automation runs in their workspaces"
  ON automation_runs FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view automation node runs in their workspaces"
  ON automation_node_runs FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to automation events"
  ON automation_events FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role has full access to automation runs"
  ON automation_runs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role has full access to automation node runs"
  ON automation_node_runs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

GRANT SELECT ON TABLE automation_events TO authenticated;
GRANT SELECT ON TABLE automation_runs TO authenticated;
GRANT SELECT ON TABLE automation_node_runs TO authenticated;

GRANT ALL ON TABLE automation_events TO service_role;
GRANT ALL ON TABLE automation_runs TO service_role;
GRANT ALL ON TABLE automation_node_runs TO service_role;
