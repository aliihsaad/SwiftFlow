-- Settings Table for storing workspace-level configurations
CREATE TABLE IF NOT EXISTS workspace_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,

  -- AI Provider Settings
  ai_provider VARCHAR(50) DEFAULT 'gemini', -- 'gemini', 'openai', etc.
  gemini_api_key TEXT,
  openai_api_key TEXT,

  -- AI Model Configuration
  ai_model_name VARCHAR(100) DEFAULT 'gemini-1.5-flash',
  ai_temperature DECIMAL(2,1) DEFAULT 0.7,
  ai_max_tokens INTEGER DEFAULT 2048,

  -- Social Media API Keys (for future use)
  facebook_app_id TEXT,
  facebook_app_secret TEXT,
  instagram_app_id TEXT,
  instagram_app_secret TEXT,

  -- Other Settings
  timezone VARCHAR(50) DEFAULT 'UTC',
  default_language VARCHAR(10) DEFAULT 'en',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(workspace_id)
);

-- Create index for faster lookups
CREATE INDEX idx_workspace_settings_workspace_id ON workspace_settings(workspace_id);

-- Enable RLS
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read settings for workspaces they're members of
CREATE POLICY "Users can read workspace settings"
ON workspace_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_settings.workspace_id
    AND workspace_members.user_id = auth.uid()
  )
);

-- Policy: Only workspace owners can update settings
CREATE POLICY "Workspace owners can update settings"
ON workspace_settings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_settings.workspace_id
    AND workspace_members.user_id = auth.uid()
    AND workspace_members.role = 'owner'
  )
);

-- Policy: Only workspace owners can insert settings
CREATE POLICY "Workspace owners can insert settings"
ON workspace_settings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_settings.workspace_id
    AND workspace_members.user_id = auth.uid()
    AND workspace_members.role = 'owner'
  )
);

-- Policy: Only workspace owners can delete settings
CREATE POLICY "Workspace owners can delete settings"
ON workspace_settings
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_settings.workspace_id
    AND workspace_members.user_id = auth.uid()
    AND workspace_members.role = 'owner'
  )
);

-- Function to automatically create default settings when workspace is created
CREATE OR REPLACE FUNCTION create_default_workspace_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workspace_settings (workspace_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create default settings
CREATE TRIGGER trigger_create_default_settings
AFTER INSERT ON workspaces
FOR EACH ROW
EXECUTE FUNCTION create_default_workspace_settings();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_workspace_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_workspace_settings_timestamp
BEFORE UPDATE ON workspace_settings
FOR EACH ROW
EXECUTE FUNCTION update_workspace_settings_timestamp();
