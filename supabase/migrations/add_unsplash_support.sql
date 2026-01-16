-- Add new columns to generated_assets table for Unsplash support
ALTER TABLE generated_assets 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'gemini',
ADD COLUMN IF NOT EXISTS unsplash_id TEXT,
ADD COLUMN IF NOT EXISTS attribution JSONB;

-- Add comments for documentation
COMMENT ON COLUMN generated_assets.source IS 'Image source: gemini or unsplash';
COMMENT ON COLUMN generated_assets.unsplash_id IS 'Unsplash photo ID for tracking';
COMMENT ON COLUMN generated_assets.attribution IS 'Photographer attribution data for Unsplash images';
