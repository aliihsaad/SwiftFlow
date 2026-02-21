export type AIProvider = 'gemini' | 'openai'

// Fallback model IDs use exact provider names.
// Live provider lists are fetched from /api/ai/models when API keys are available.
export const FALLBACK_PROVIDER_MODELS: Record<AIProvider, string[]> = {
  gemini: [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ],
  openai: [
    'gpt-4o-mini',
    'gpt-4o',
  ],
}

export function getFallbackModelsForProvider(provider: AIProvider): string[] {
  return [...(FALLBACK_PROVIDER_MODELS[provider] || [])]
}

export function getDefaultModelForProvider(provider: AIProvider): string {
  return FALLBACK_PROVIDER_MODELS[provider]?.[0] || 'gemini-2.0-flash'
}

export function isAIProvider(value: string): value is AIProvider {
  return value === 'gemini' || value === 'openai'
}
