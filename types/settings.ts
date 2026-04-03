export interface WorkspaceSettings {
  id: string
  workspace_id: string

  // AI Provider Settings
  ai_provider: 'openrouter' | 'gemini' | 'openai' | string
  openrouter_api_key: string | null
  gemini_api_key: string | null
  openai_api_key: string | null

  // AI Model Configuration
  ai_text_model_name: string
  ai_image_model_name: string | null
  ai_model_name: string
  ai_temperature: number
  ai_max_tokens: number


  // Other Settings
  timezone: string
  default_language: string

  created_at: string
  updated_at: string
}

export interface UpdateSettingsInput {
  // AI Provider Settings
  ai_provider?: 'openrouter' | 'gemini' | 'openai'
  openrouter_api_key?: string
  gemini_api_key?: string
  openai_api_key?: string

  // AI Model Configuration
  ai_text_model_name?: string
  ai_image_model_name?: string
  ai_model_name?: string
  ai_temperature?: number
  ai_max_tokens?: number


  // Other Settings
  timezone?: string
  default_language?: string
}
