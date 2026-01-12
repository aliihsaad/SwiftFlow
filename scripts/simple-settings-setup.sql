-- Simple Settings Table Setup (No RLS, No Complex Permissions)
-- Run this in your Supabase SQL Editor

-- Drop existing table if you want to start fresh
-- DROP TABLE IF EXISTS workspace_settings CASCADE;

-- Create simple settings table
CREATE TABLE IF NOT EXISTS workspace_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,

  -- AI Provider Settings
  ai_provider VARCHAR(50) DEFAULT 'gemini',
  gemini_api_key TEXT,
  openai_api_key TEXT,

  -- AI Model Configuration
  ai_model_name VARCHAR(100) DEFAULT 'gemini-1.5-flash',
  ai_temperature DECIMAL(2,1) DEFAULT 0.7,
  ai_max_tokens INTEGER DEFAULT 2048,

  -- Social Media API Keys
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
CREATE INDEX IF NOT EXISTS idx_workspace_settings_workspace_id ON workspace_settings(workspace_id);

-- Disable RLS (since it's an internal tool)
ALTER TABLE workspace_settings DISABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Users can read workspace settings" ON workspace_settings;
DROP POLICY IF EXISTS "Workspace owners can update settings" ON workspace_settings;
DROP POLICY IF EXISTS "Workspace owners can insert settings" ON workspace_settings;
DROP POLICY IF EXISTS "Workspace owners can delete settings" ON workspace_settings;

-- Create trigger function for auto-creating settings
CREATE OR REPLACE FUNCTION create_default_workspace_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workspace_settings (workspace_id)
  VALUES (NEW.id)
  ON CONFLICT (workspace_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_create_default_settings ON workspaces;
CREATE TRIGGER trigger_create_default_settings
AFTER INSERT ON workspaces
FOR EACH ROW
EXECUTE FUNCTION create_default_workspace_settings();

-- Create settings for existing workspaces
INSERT INTO workspace_settings (workspace_id)
SELECT id FROM workspaces
WHERE id NOT IN (SELECT workspace_id FROM workspace_settings)
ON CONFLICT (workspace_id) DO NOTHING;

-- Show summary
SELECT
  COUNT(*) as total_workspaces,
  (SELECT COUNT(*) FROM workspace_settings) as workspaces_with_settings
FROM workspaces;

SELECT '✅ Setup complete!' as status;
