export interface WorkspaceSettings {
  id: string
  workspace_id: string

  // AI Provider Settings
  ai_provider: 'gemini' | 'openai' | string
  gemini_api_key: string | null
  openai_api_key: string | null

  // AI Model Configuration
  ai_model_name: string
  ai_temperature: number
  ai_max_tokens: number

  // Meta App Credentials (per-workspace)
  meta_app_id: string | null
  meta_app_secret: string | null

  // Other Settings
  timezone: string
  default_language: string

  created_at: string
  updated_at: string
}

export interface UpdateSettingsInput {
  // AI Provider Settings
  ai_provider?: 'gemini' | 'openai'
  gemini_api_key?: string
  openai_api_key?: string

  // AI Model Configuration
  ai_model_name?: string
  ai_temperature?: number
  ai_max_tokens?: number

  // Meta App Credentials
  meta_app_id?: string
  meta_app_secret?: string

  // Other Settings
  timezone?: string
  default_language?: string
}
