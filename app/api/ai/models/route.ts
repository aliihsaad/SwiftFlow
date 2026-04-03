import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getActiveWorkspace } from '@/lib/workspace-utils'
import {
  getCuratedModelsForProvider,
  getFallbackModelsForProvider,
  isAIProvider,
  type AIProvider,
} from '@/lib/ai-models'
import { decryptSecretIfNeeded } from '@/lib/secret-crypto'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function sortModelIds(ids: string[]): string[] {
  return [...new Set(ids)]
    .map((id) => id.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

function normalizeApiKey(value: unknown): string {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '')
}

function normalizeGeminiModelName(name: string): string {
  return name.replace(/^models\//, '').trim()
}

function isLikelyTextOpenRouterModel(id: string): boolean {
  const normalized = id.trim().toLowerCase()
  if (!normalized || !normalized.includes('/')) return false
  const excluded =
    /(embedding|moderation|whisper|tts|transcribe|realtime|image|audio|video|vision-preview|omni-moderation)/i
  return !excluded.test(normalized)
}

function isLikelyTextOpenAIModel(id: string): boolean {
  const isBaseTextModel = /^(gpt-|chatgpt-|o\d)/i.test(id)
  const isFineTunedTextModel = /^ft:/i.test(id) && /(gpt-|chatgpt-|o\d)/i.test(id)
  if (!isBaseTextModel && !isFineTunedTextModel) return false
  const excluded = /(audio|transcribe|realtime|search|image|moderation|embedding|whisper|tts|instruct|codex)/i
  return !excluded.test(id)
}

function isLikelyImageOpenAIModel(id: string): boolean {
  return /^(gpt-image-1(\.5|-mini)?|dall-e-2|dall-e-3)$/i.test(id.trim())
}

async function fetchGeminiModels(apiKey: string, capability: 'text' | 'image'): Promise<string[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json()

  if (!response.ok) {
    throw new Error(result?.error?.message || 'Gemini models fetch failed')
  }

  const models = (Array.isArray(result?.models) ? result.models : [])
    .filter((m: { supportedGenerationMethods?: string[] }) =>
      Array.isArray(m?.supportedGenerationMethods) &&
      m.supportedGenerationMethods.includes('generateContent')
    )
    .map((m: { name?: string }) => normalizeGeminiModelName(String(m?.name || '')))
    .filter((id: string) => id.startsWith('gemini'))
    .filter((id: string) => capability === 'image' ? id.includes('image') : !id.includes('image'))

  return sortModelIds(models)
}

async function fetchOpenAIModels(apiKey: string, capability: 'text' | 'image'): Promise<string[]> {
  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  const result = await response.json()
  if (!response.ok) {
    throw new Error(result?.error?.message || 'OpenAI models fetch failed')
  }

  const models = (Array.isArray(result?.data) ? result.data : [])
    .map((m: { id?: string }) => String(m?.id || '').trim())
    .filter(Boolean)
    .filter((id: string) => capability === 'image' ? isLikelyImageOpenAIModel(id) : isLikelyTextOpenAIModel(id))

  return sortModelIds(models)
}

async function fetchOpenRouterModels(apiKey: string, capability: 'text' | 'image'): Promise<string[]> {
  const suffix = capability === 'image' ? '?output_modality=image' : ''
  const response = await fetch(`https://openrouter.ai/api/v1/models${suffix}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  const result = await response.json()
  if (!response.ok) {
    throw new Error(result?.error?.message || 'OpenRouter models fetch failed')
  }

  const models = (Array.isArray(result?.data) ? result.data : [])
    .map((m: { id?: string }) => String(m?.id || '').trim())
    .filter(Boolean)
    .filter((id: string) => capability === 'image' ? true : isLikelyTextOpenRouterModel(id))

  return sortModelIds(models)
}

async function fetchProviderModels(provider: AIProvider, apiKey: string, capability: 'text' | 'image'): Promise<string[]> {
  if (provider === 'openrouter') return fetchOpenRouterModels(apiKey, capability)
  if (provider === 'gemini') return fetchGeminiModels(apiKey, capability)
  return fetchOpenAIModels(apiKey, capability)
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const providerParam = request.nextUrl.searchParams.get('provider') || 'openrouter'
    const capabilityParam = request.nextUrl.searchParams.get('capability') === 'image' ? 'image' : 'text'
    if (!isAIProvider(providerParam)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) {
      return NextResponse.json(
        {
          models: getFallbackModelsForProvider(providerParam, capabilityParam),
          curated: getCuratedModelsForProvider(providerParam, capabilityParam),
          provider: providerParam,
          capability: capabilityParam,
          source: 'fallback',
          reason: 'no_active_workspace',
        },
        { status: 200 }
      )
    }

    const { data: settings } = await supabase
      .from('workspace_settings')
      .select('openrouter_api_key, gemini_api_key, openai_api_key')
      .eq('workspace_id', activeWorkspace.id)
      .maybeSingle()

    const apiKey =
      providerParam === 'openrouter'
        ? normalizeApiKey(decryptSecretIfNeeded(settings?.openrouter_api_key))
        : providerParam === 'gemini'
        ? normalizeApiKey(decryptSecretIfNeeded(settings?.gemini_api_key))
        : normalizeApiKey(decryptSecretIfNeeded(settings?.openai_api_key))

    if (!apiKey) {
      return NextResponse.json(
        {
          models: getFallbackModelsForProvider(providerParam, capabilityParam),
          curated: getCuratedModelsForProvider(providerParam, capabilityParam),
          provider: providerParam,
          capability: capabilityParam,
          source: 'fallback',
          reason: 'missing_api_key',
        },
        { status: 200 }
      )
    }

    try {
      const models = await fetchProviderModels(providerParam, apiKey, capabilityParam)
      if (!models.length) {
        return NextResponse.json(
          {
            models: getFallbackModelsForProvider(providerParam, capabilityParam),
            curated: getCuratedModelsForProvider(providerParam, capabilityParam),
            provider: providerParam,
            capability: capabilityParam,
            source: 'fallback',
            reason: 'empty_provider_list',
          },
          { status: 200 }
        )
      }

      return NextResponse.json({
        models,
        curated: getCuratedModelsForProvider(providerParam, capabilityParam),
        provider: providerParam,
        capability: capabilityParam,
        source: 'live',
      })
    } catch (providerError) {
      console.error('[AI_MODELS] Provider fetch failed:', providerError)
      return NextResponse.json(
        {
          models: getFallbackModelsForProvider(providerParam, capabilityParam),
          curated: getCuratedModelsForProvider(providerParam, capabilityParam),
          provider: providerParam,
          capability: capabilityParam,
          source: 'fallback',
          reason: 'provider_fetch_failed',
        },
        { status: 200 }
      )
    }
  } catch (error) {
    console.error('[AI_MODELS] Unexpected error:', error)
    return NextResponse.json({ error: 'Failed to load models' }, { status: 500 })
  }
}
