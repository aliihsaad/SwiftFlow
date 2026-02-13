-- Add Meta App credentials to workspace_settings
-- This allows each workspace to use their own Meta app, bypassing app review

ALTER TABLE workspace_settings
ADD COLUMN IF NOT EXISTS meta_app_id TEXT,
ADD COLUMN IF NOT EXISTS meta_app_secret TEXT;

-- Add comment for documentation
COMMENT ON COLUMN workspace_settings.meta_app_id IS 'Meta/Facebook App ID for this workspace OAuth';
COMMENT ON COLUMN workspace_settings.meta_app_secret IS 'Meta/Facebook App Secret for this workspace OAuth';
