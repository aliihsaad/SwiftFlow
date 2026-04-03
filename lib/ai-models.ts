export type AIProvider = 'openrouter' | 'gemini' | 'openai'
export type AIModelCapability = 'text' | 'image'

export interface AIModelOption {
  id: string
  label: string
  summary: string
  recommendation: 'cost' | 'balanced' | 'quality'
}

type ProviderModelCatalog = Record<AIModelCapability, AIModelOption[]>

export const PROVIDER_MODEL_CATALOG: Record<AIProvider, ProviderModelCatalog> = {
  openrouter: {
    text: [
      {
        id: 'openai/gpt-4o-mini',
        label: 'GPT-4o Mini',
        summary: 'Balanced default for everyday text generation and low-cost volume.',
        recommendation: 'balanced',
      },
      {
        id: 'anthropic/claude-3.5-haiku',
        label: 'Claude 3.5 Haiku',
        summary: 'Fast and cost-conscious for quick replies, captions, and automations.',
        recommendation: 'cost',
      },
      {
        id: 'openai/gpt-4o',
        label: 'GPT-4o',
        summary: 'Higher quality for brand-sensitive writing and harder prompts.',
        recommendation: 'quality',
      },
    ],
    image: [
      {
        id: 'google/gemini-2.5-flash-image-preview',
        label: 'Gemini 2.5 Flash Image',
        summary: 'Balanced default for prompt-following and brand-driven image generation.',
        recommendation: 'balanced',
      },
      {
        id: 'black-forest-labs/flux.1-schnell',
        label: 'FLUX.1 Schnell',
        summary: 'Lower-cost, faster image generation when speed matters most.',
        recommendation: 'cost',
      },
      {
        id: 'black-forest-labs/flux.1.1-pro',
        label: 'FLUX 1.1 Pro',
        summary: 'Premium quality for polished campaign visuals and hero assets.',
        recommendation: 'quality',
      },
    ],
  },
  gemini: {
    text: [
      {
        id: 'gemini-2.5-flash-lite',
        label: 'Gemini 2.5 Flash-Lite',
        summary: 'Most cost-efficient Gemini option for high-volume text tasks.',
        recommendation: 'cost',
      },
      {
        id: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash',
        summary: 'Best price-performance balance for most assistant and content flows.',
        recommendation: 'balanced',
      },
      {
        id: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro',
        summary: 'Highest-quality reasoning and writing for complex prompts.',
        recommendation: 'quality',
      },
    ],
    image: [
      {
        id: 'gemini-2.5-flash-image',
        label: 'Gemini 2.5 Flash Image',
        summary: 'Recommended Gemini image model for text-to-image and edits.',
        recommendation: 'balanced',
      },
      {
        id: 'gemini-2.0-flash-preview-image-generation',
        label: 'Gemini 2.0 Flash Image Preview',
        summary: 'Lower-cost preview option for experiments and quick drafts.',
        recommendation: 'cost',
      },
      {
        id: 'gemini-3-pro-image-preview',
        label: 'Gemini 3 Pro Image Preview',
        summary: 'Highest-quality Gemini preview option for stronger visual detail.',
        recommendation: 'quality',
      },
    ],
  },
  openai: {
    text: [
      {
        id: 'gpt-4o-mini',
        label: 'GPT-4o Mini',
        summary: 'Best value for captions, replies, and general assistant flows.',
        recommendation: 'balanced',
      },
      {
        id: 'gpt-4.1-mini',
        label: 'GPT-4.1 Mini',
        summary: 'Cost-effective option when you want stronger instruction following than older mini models.',
        recommendation: 'cost',
      },
      {
        id: 'gpt-4o',
        label: 'GPT-4o',
        summary: 'Higher-quality writing and stronger multimodal reasoning.',
        recommendation: 'quality',
      },
    ],
    image: [
      {
        id: 'gpt-image-1-mini',
        label: 'GPT Image 1 Mini',
        summary: 'Cost-effective image generation when speed and budget matter more than polish.',
        recommendation: 'cost',
      },
      {
        id: 'gpt-image-1',
        label: 'GPT Image 1',
        summary: 'Balanced option for general-purpose image generation and editing.',
        recommendation: 'balanced',
      },
      {
        id: 'gpt-image-1.5',
        label: 'GPT Image 1.5',
        summary: 'Best overall quality for polished campaign visuals and text rendering.',
        recommendation: 'quality',
      },
    ],
  },
}

export function getCuratedModelsForProvider(provider: AIProvider, capability: AIModelCapability): AIModelOption[] {
  return [...(PROVIDER_MODEL_CATALOG[provider]?.[capability] || [])]
}

export function getFallbackModelsForProvider(provider: AIProvider, capability: AIModelCapability = 'text'): string[] {
  return getCuratedModelsForProvider(provider, capability).map((model) => model.id)
}

export function getDefaultModelForProvider(provider: AIProvider): string {
  return getDefaultTextModelForProvider(provider)
}

export function getDefaultTextModelForProvider(provider: AIProvider): string {
  return getFallbackModelsForProvider(provider, 'text')?.[0] || 'openai/gpt-4o-mini'
}

export function getDefaultImageModelForProvider(provider: AIProvider): string | null {
  return getFallbackModelsForProvider(provider, 'image')?.[0] || null
}

export function getModelRecommendationLabel(recommendation: AIModelOption['recommendation']): string {
  if (recommendation === 'cost') return 'Lowest Cost'
  if (recommendation === 'quality') return 'Highest Quality'
  return 'Balanced Default'
}

export function isAIProvider(value: string): value is AIProvider {
  return value === 'openrouter' || value === 'gemini' || value === 'openai'
}
