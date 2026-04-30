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
        id: 'google/gemini-2.5-flash-image',
        label: 'Nano Banana',
        summary: 'Most cost-effective OpenRouter image option for fast image generation, edits, and reliable prompt adherence.',
        recommendation: 'cost',
      },
      {
        id: 'google/gemini-3.1-flash-image-preview',
        label: 'Nano Banana 2',
        summary: 'Newer OpenRouter Gemini image route with stronger edits, image understanding, and improved multimodal output quality.',
        recommendation: 'balanced',
      },
      {
        id: 'openai/gpt-5-image-mini',
        label: 'GPT-5 Image Mini',
        summary: 'Balanced OpenRouter default for polished visuals, strong text rendering, and dependable general-purpose image generation.',
        recommendation: 'balanced',
      },
      {
        id: 'openai/gpt-5-image',
        label: 'GPT-5 Image',
        summary: 'Highest-quality OpenRouter image option for polished campaign visuals and premium creative work.',
        recommendation: 'quality',
      },
      {
        id: 'google/gemini-3-pro-image-preview',
        label: 'Nano Banana Pro',
        summary: 'High-fidelity OpenRouter image model with stronger creative control and advanced editing behavior.',
        recommendation: 'quality',
      },
      {
        id: 'black-forest-labs/flux.2-flex',
        label: 'FLUX.2 Flex',
        summary: 'Alternative OpenRouter image route for typography-sensitive visuals and editing workflows.',
        recommendation: 'balanced',
      },
      {
        id: 'black-forest-labs/flux.2-max',
        label: 'FLUX.2 Max',
        summary: 'Higher-end FLUX route for richer visual detail when OpenRouter image routing is available for your account.',
        recommendation: 'quality',
      },
      {
        id: 'black-forest-labs/flux.2-klein-4b',
        label: 'FLUX.2 Klein 4B',
        summary: 'Lean FLUX route for lower-cost experimentation when premium image routes are unavailable.',
        recommendation: 'cost',
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
        summary: 'Recommended production Gemini image model for text-to-image and image edits.',
        recommendation: 'balanced',
      },
      {
        id: 'gemini-3-pro-image-preview',
        label: 'Gemini 3 Pro Image Preview',
        summary: 'Highest-quality Gemini image option for stronger instruction following and detailed creative work.',
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
  if (provider === 'openrouter') return 'google/gemini-2.5-flash-image'
  return getFallbackModelsForProvider(provider, 'image')?.[0] || null
}

export function getModelRecommendationLabel(recommendation: AIModelOption['recommendation']): string {
  if (recommendation === 'cost') return 'Lowest Cost'
  if (recommendation === 'quality') return 'Highest Quality'
  return 'Balanced Default'
}

const TYPOGRAPHY_SAFE_IMAGE_MODEL_IDS = new Set([
  'openai/gpt-5-image',
  'openai/gpt-5-image-mini',
  'gpt-image-1.5',
  'black-forest-labs/flux.2-flex',
  'black-forest-labs/flux.2-max',
  'google/gemini-3-pro-image-preview',
  'gemini-3-pro-image-preview',
])

function normalizeModelId(modelId: string | null | undefined): string {
  return (modelId || '').trim().toLowerCase()
}

export function getModelLabel(provider: AIProvider, capability: AIModelCapability, modelId: string | null | undefined): string {
  const normalized = normalizeModelId(modelId)
  return getCuratedModelsForProvider(provider, capability).find((model) => normalizeModelId(model.id) === normalized)?.label || modelId || 'Default model'
}

export function isTypographySafeImageModel(modelId: string | null | undefined): boolean {
  return TYPOGRAPHY_SAFE_IMAGE_MODEL_IDS.has(normalizeModelId(modelId))
}

export function getTypographySafeImageModels(provider: AIProvider): AIModelOption[] {
  return getCuratedModelsForProvider(provider, 'image').filter((model) => isTypographySafeImageModel(model.id))
}

export function isAIProvider(value: string): value is AIProvider {
  return value === 'openrouter' || value === 'gemini' || value === 'openai'
}
