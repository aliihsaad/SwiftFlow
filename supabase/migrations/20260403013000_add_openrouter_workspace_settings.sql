ALTER TABLE workspace_settings
ADD COLUMN IF NOT EXISTS openrouter_api_key TEXT;

ALTER TABLE workspace_settings
ALTER COLUMN ai_provider SET DEFAULT 'openrouter';

ALTER TABLE workspace_settings
ALTER COLUMN ai_model_name SET DEFAULT 'openai/gpt-4o-mini';
