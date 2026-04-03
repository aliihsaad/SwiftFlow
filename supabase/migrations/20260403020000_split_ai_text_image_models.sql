ALTER TABLE workspace_settings
ADD COLUMN IF NOT EXISTS ai_text_model_name TEXT;

ALTER TABLE workspace_settings
ADD COLUMN IF NOT EXISTS ai_image_model_name TEXT;

UPDATE workspace_settings
SET ai_text_model_name = COALESCE(NULLIF(ai_text_model_name, ''), NULLIF(ai_model_name, ''), 'openai/gpt-4o-mini')
WHERE ai_text_model_name IS NULL OR ai_text_model_name = '';

ALTER TABLE workspace_settings
ALTER COLUMN ai_text_model_name SET DEFAULT 'openai/gpt-4o-mini';
