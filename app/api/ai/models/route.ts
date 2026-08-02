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

interface OpenRouterModelRecord {
  id?: string
  architecture?: {
    output_modalities?: string[]
  }
}

function isLikelyTextOpenRouterModel(id: string): boolean {
  const normalized = id.trim().toLowerCase()
  if (!normalized || !normalized.includes('/')) return false
  return !/(embedding|moderation|whisper|tts|transcribe|realtime|image|audio|video|vision-preview|omni-moderation)/i.test(normalized)
}

function isLikelyTextOpenAIModel(id: string): boolean {
  const isBaseTextModel = /^(gpt-|chatgpt-|o\d)/i.test(id)
  const isFineTunedTextModel = /^ft:/i.test(id) && /(gpt-|chatgpt-|o\d)/i.test(id)
  if (!isBaseTextModel && !isFineTunedTextModel) return false
  return !/(audio|transcribe|realtime|search|image|moderation|embedding|whisper|tts|instruct|codex)/i.test(id)
}

async function fetchGeminiModels(apiKey: string): Promise<string[]> {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey)
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json()

  if (!response.ok) {
    throw new Error(result?.error?.message || 'Gemini models fetch failed')
  }

  const models = (Array.isArray(result?.models) ? result.models : [])
    .filter((model: { supportedGenerationMethods?: string[] }) =>
      Array.isArray(model?.supportedGenerationMethods) &&
      model.supportedGenerationMethods.includes('generateContent')
    )
    .map((model: { name?: string }) => normalizeGeminiModelName(String(model?.name || '')))
    .filter((id: string) => id.startsWith('gemini') && !id.includes('image'))

  return sortModelIds(models)
}

async function fetchOpenAIModels(apiKey: string): Promise<string[]> {
  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  const result = await response.json()
  if (!response.ok) {
    throw new Error(result?.error?.message || 'OpenAI models fetch failed')
  }

  return sortModelIds(
    (Array.isArray(result?.data) ? result.data : [])
      .map((model: { id?: string }) => String(model?.id || '').trim())
      .filter((id: string) => Boolean(id) && isLikelyTextOpenAIModel(id)),
  )
}

async function fetchOpenRouterModels(apiKey: string): Promise<string[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models?output_modalities=text', {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result?.error?.message || 'OpenRouter models fetch failed')
  }

  const rows = (Array.isArray(result?.data) ? result.data : []) as OpenRouterModelRecord[]
  const models = rows
    .map((model) => {
      const id = String(model?.id || '').trim()
      const outputModalities = Array.isArray(model?.architecture?.output_modalities)
        ? model.architecture.output_modalities.map((entry) => String(entry || '').trim().toLowerCase())
        : []

      if (!id || (outputModalities.length > 0 && !outputModalities.includes('text'))) return ''
      return isLikelyTextOpenRouterModel(id) ? id : ''
    })
    .filter(Boolean)

  return sortModelIds(models)
}

async function fetchProviderModels(provider: AIProvider, apiKey: string): Promise<string[]> {
  if (provider === 'openrouter') return fetchOpenRouterModels(apiKey)
  if (provider === 'gemini') return fetchGeminiModels(apiKey)
  return fetchOpenAIModels(apiKey)
}

function fallbackPayload(provider: AIProvider, reason: string) {
  return {
    models: getFallbackModelsForProvider(provider),
    curated: getCuratedModelsForProvider(provider),
    provider,
    capability: 'text',
    source: 'fallback',
    reason,
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const providerParam = request.nextUrl.searchParams.get('provider') || 'openrouter'
    const capabilityParam = request.nextUrl.searchParams.get('capability')
    if (!isAIProvider(providerParam)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }
    if (capabilityParam && capabilityParam !== 'text') {
      return NextResponse.json({ error: 'Only text models are supported' }, { status: 400 })
    }

    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) {
      return NextResponse.json(fallbackPayload(providerParam, 'no_active_workspace'))
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
      return NextResponse.json(fallbackPayload(providerParam, 'missing_api_key'))
    }

    try {
      const models = await fetchProviderModels(providerParam, apiKey)
      if (!models.length) {
        return NextResponse.json(fallbackPayload(providerParam, 'empty_provider_list'))
      }

      return NextResponse.json({
        models,
        curated: getCuratedModelsForProvider(providerParam),
        provider: providerParam,
        capability: 'text',
        source: 'live',
      })
    } catch (providerError) {
      console.error('[AI_MODELS] Provider fetch failed:', providerError)
      return NextResponse.json(fallbackPayload(providerParam, 'provider_fetch_failed'))
    }
  } catch (error) {
    console.error('[AI_MODELS] Unexpected error:', error)
    return NextResponse.json({ error: 'Failed to load models' }, { status: 500 })
  }
}