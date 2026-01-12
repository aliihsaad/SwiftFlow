-- Backfill missing workspace_settings for existing workspaces

INSERT INTO workspace_settings (workspace_id)
SELECT id FROM workspaces
WHERE id NOT IN (SELECT workspace_id FROM workspace_settings)
ON CONFLICT (workspace_id) DO NOTHING;

-- Verify the result
SELECT 
    (SELECT COUNT(*) FROM workspaces) as total_workspaces,
    (SELECT COUNT(*) FROM workspace_settings) as total_settings;
