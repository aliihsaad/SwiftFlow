-- Add language field to workspace_brand_profiles
ALTER TABLE workspace_brand_profiles
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
