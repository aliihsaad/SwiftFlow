export type AIProvider = 'openrouter' | 'gemini' | 'openai'
export type AIModelCapability = 'text'

export interface AIModelOption {
  id: string
  label: string
  summary: string
  recommendation: 'cost' | 'balanced' | 'quality'
}

export const PROVIDER_MODEL_CATALOG: Record<AIProvider, AIModelOption[]> = {
  openrouter: [
    {
      id: 'openai/gpt-4o-mini',
      label: 'GPT-4o Mini',
      summary: 'Balanced default for fast, reliable engagement replies.',
      recommendation: 'balanced',
    },
    {
      id: 'anthropic/claude-3.5-haiku',
      label: 'Claude 3.5 Haiku',
      summary: 'Cost-conscious for high-volume comment and message replies.',
      recommendation: 'cost',
    },
    {
      id: 'openai/gpt-4o',
      label: 'GPT-4o',
      summary: 'Higher quality for nuanced, brand-sensitive conversations.',
      recommendation: 'quality',
    },
  ],
  gemini: [
    {
      id: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash-Lite',
      summary: 'Most cost-efficient Gemini option for high-volume replies.',
      recommendation: 'cost',
    },
    {
      id: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      summary: 'Best price-performance balance for engagement automations.',
      recommendation: 'balanced',
    },
    {
      id: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      summary: 'Highest-quality reasoning for complex conversations.',
      recommendation: 'quality',
    },
  ],
  openai: [
    {
      id: 'gpt-4o-mini',
      label: 'GPT-4o Mini',
      summary: 'Best value for comment and inbox replies.',
      recommendation: 'balanced',
    },
    {
      id: 'gpt-4.1-mini',
      label: 'GPT-4.1 Mini',
      summary: 'Cost-effective with strong instruction following.',
      recommendation: 'cost',
    },
    {
      id: 'gpt-4o',
      label: 'GPT-4o',
      summary: 'Higher-quality writing for sensitive customer conversations.',
      recommendation: 'quality',
    },
  ],
}

export function getCuratedModelsForProvider(
  provider: AIProvider,
  capability: AIModelCapability = 'text',
): AIModelOption[] {
  void capability
  return [...(PROVIDER_MODEL_CATALOG[provider] || [])]
}

export function getFallbackModelsForProvider(
  provider: AIProvider,
  capability: AIModelCapability = 'text',
): string[] {
  return getCuratedModelsForProvider(provider, capability).map((model) => model.id)
}

export function getDefaultModelForProvider(provider: AIProvider): string {
  return getDefaultTextModelForProvider(provider)
}

export function getDefaultTextModelForProvider(provider: AIProvider): string {
  return getFallbackModelsForProvider(provider)[0] || 'openai/gpt-4o-mini'
}

export function getModelRecommendationLabel(
  recommendation: AIModelOption['recommendation'],
): string {
  if (recommendation === 'cost') return 'Lowest Cost'
  if (recommendation === 'quality') return 'Highest Quality'
  return 'Balanced Default'
}

export function isAIProvider(value: string): value is AIProvider {
  return value === 'openrouter' || value === 'gemini' || value === 'openai'
}