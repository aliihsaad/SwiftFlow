-- Quick Setup Script for Workspace Settings
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Check if table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'workspace_settings') THEN
        RAISE NOTICE 'Creating workspace_settings table...';

        -- Create the table
        CREATE TABLE workspace_settings (
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

        -- Create index
        CREATE INDEX idx_workspace_settings_workspace_id ON workspace_settings(workspace_id);

        RAISE NOTICE 'Table created successfully!';
    ELSE
        RAISE NOTICE 'Table already exists, skipping creation.';
    END IF;
END $$;

-- Enable RLS
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read workspace settings" ON workspace_settings;
DROP POLICY IF EXISTS "Workspace owners can update settings" ON workspace_settings;
DROP POLICY IF EXISTS "Workspace owners can insert settings" ON workspace_settings;
DROP POLICY IF EXISTS "Workspace owners can delete settings" ON workspace_settings;

-- Create policies
CREATE POLICY "Users can read workspace settings"
ON workspace_settings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_settings.workspace_id
    AND workspace_members.user_id = auth.uid()
  )
);

CREATE POLICY "Workspace owners can update settings"
ON workspace_settings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_settings.workspace_id
    AND workspace_members.user_id = auth.uid()
    AND workspace_members.role = 'owner'
  )
);

CREATE POLICY "Workspace owners can insert settings"
ON workspace_settings FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_settings.workspace_id
    AND workspace_members.user_id = auth.uid()
    AND workspace_members.role = 'owner'
  )
);

CREATE POLICY "Workspace owners can delete settings"
ON workspace_settings FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_settings.workspace_id
    AND workspace_members.user_id = auth.uid()
    AND workspace_members.role = 'owner'
  )
);

-- Create trigger function
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

-- Show results
SELECT
    'Total workspaces' as metric,
    COUNT(*)::text as value
FROM workspaces
UNION ALL
SELECT
    'Workspaces with settings' as metric,
    COUNT(*)::text as value
FROM workspace_settings
UNION ALL
SELECT
    'Missing settings' as metric,
    (SELECT COUNT(*) FROM workspaces WHERE id NOT IN (SELECT workspace_id FROM workspace_settings))::text as value;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Setup complete! All workspaces now have default settings.';
END $$;
