import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { resolveAIConfig, toUserFriendlyError } from "../_shared/ai-config.ts"
import { createOpenRouterChatCompletion, extractOpenRouterTextContent } from "../_shared/openrouter-client.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Message {
    role: 'user' | 'assistant'
    content: string
    images?: { base64: string; mimeType: string }[]
}

function toDataUrl(image: { base64: string; mimeType: string }): string {
    return `data:${image.mimeType};base64,${image.base64}`
}

function toOpenAICompatibleContent(message: Message) {
    if (!message.images?.length) {
        return message.content
    }

    return [
        { type: 'text', text: message.content },
        ...message.images.map((image) => ({
            type: 'image_url' as const,
            image_url: { url: toDataUrl(image) }
        })),
    ]
}

function buildOpenAICompatibleMessages(messages: Message[], systemInstruction: string) {
    const normalizedHistory = messages
        .filter((m, index) => !(index === 0 && m.role === 'assistant'))
        .map((m) => ({
            role: m.role === 'user' ? 'user' as const : 'assistant' as const,
            content: toOpenAICompatibleContent(m),
        }))

    return [
        { role: 'system' as const, content: systemInstruction },
        ...normalizedHistory,
    ]
}

function safeList(value: unknown, limit = 8): string {
    return Array.isArray(value)
        ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, limit).join(', ')
        : ''
}

function formatAssistantContext(context: unknown, intent: unknown): string {
    if (!context || typeof context !== 'object') return ''

    const ctx = context as Record<string, any>
    const lines: string[] = []
    const intentRecord = intent && typeof intent === 'object' ? intent as Record<string, unknown> : {}

    if (intentRecord.mode || intentRecord.action) {
        lines.push(`Intent: mode=${intentRecord.mode || 'unknown'}, action=${intentRecord.action || 'unknown'}`)
    }

    const brand = ctx.brand || {}
    if (brand.businessName || brand.industry || brand.brandVoice) {
        lines.push(`Brand: ${brand.businessName || 'Workspace'}; industry=${brand.industry || 'unknown'}; voice=${brand.brandVoice || 'professional'}; audience=${brand.targetAudience || 'not specified'}`)
    }
    if (brand.businessDescription) lines.push(`Brand description: ${String(brand.businessDescription).slice(0, 600)}`)
    if (Array.isArray(brand.contentThemes) && brand.contentThemes.length) lines.push(`Content themes: ${safeList(brand.contentThemes, 10)}`)
    if (Array.isArray(brand.uniqueSellingPoints) && brand.uniqueSellingPoints.length) lines.push(`Unique selling points: ${safeList(brand.uniqueSellingPoints, 8)}`)

    const accounts = ctx.accounts || {}
    if (Array.isArray(accounts.items)) {
        lines.push(`Connected accounts: ${accounts.items.map((item: any) => `${item.platform}:${item.accountName || item.accountId}`).join(', ') || 'none'}`)
    }

    const content = ctx.content || {}
    if (Array.isArray(content.recentPosts) && content.recentPosts.length) {
        lines.push(`Recent posts: ${content.recentPosts.slice(0, 8).map((post: any) => `[${post.status}] ${String(post.content || '').slice(0, 140)}`).join(' | ')}`)
    }

    const analytics = ctx.analytics || null
    if (analytics?.totals) {
        lines.push(`Analytics ${analytics.range || '30d'} totals: views=${analytics.totals.views || 0}, likes=${analytics.totals.likes || 0}, comments=${analytics.totals.comments || 0}, shares=${analytics.totals.shares || 0}, saves=${analytics.totals.saves || 0}, publishedPosts=${analytics.totals.publishedPosts || 0}`)
    }
    if (Array.isArray(analytics?.topPosts) && analytics.topPosts.length) {
        lines.push(`Top posts: ${analytics.topPosts.slice(0, 5).map((post: any) => `${post.platform || 'platform'} views=${post.views || 0} likes=${post.likes || 0} comments=${post.comments || 0}`).join(' | ')}`)
    }

    const automations = ctx.automations || {}
    if (Array.isArray(automations.items)) {
        lines.push(`Automations: ${automations.items.slice(0, 8).map((item: any) => `${item.isActive ? 'active' : 'paused'} ${item.name} (${item.type}) triggers=${item.totalTriggered || 0}`).join(' | ') || 'none'}`)
    }

    if (Array.isArray(ctx.warnings) && ctx.warnings.length) {
        lines.push(`Context warnings: ${safeList(ctx.warnings, 5)}`)
    }

    return lines.length
        ? `\n\nWorkspace context for this answer:\n${lines.map((line) => `- ${line}`).join('\n')}\n\nUse this context when relevant. If context is missing or partial, say that clearly. Do not claim live data beyond these provided facts.`
        : ''
}

function formatAssistantResponseContract(intent: unknown): string {
    const intentRecord = intent && typeof intent === 'object' ? intent as Record<string, unknown> : {}
    const mode = String(intentRecord.mode || '').toLowerCase()
    const action = String(intentRecord.action || '').toLowerCase()
    const isAnalysis = mode === 'analyze' || action.includes('analyze') || action.includes('inspect')

    if (!isAnalysis) {
        return `\n\nResponse format:\n- Do not use Markdown headings, hash-heading syntax, or double-asterisk bold markers.\n- Keep responses short and scannable.\n- Use plain bullets only when listing options.\n- Avoid generic capability descriptions. Answer the user's exact request.`
    }

    return `\n\nAnalysis response format:\nReturn a compact briefing using exactly these labels when the data exists:\nBRIEF: one direct sentence with the main takeaway.\nMETRICS: Views=<value>, Likes=<value>, Comments=<value>, Saves=<value>, Posts=<value>\nWHAT HAPPENED:\n- one concrete pattern from the data\n- one concrete risk or gap if relevant\nPOST NEXT:\n- one specific post idea\n- one specific angle or hook\nTIMING:\n- one timing or cadence recommendation\nACTIONS:\n- one next action the user can take now\n\nRules:\n- No Markdown headings, no hash-heading syntax, no double-asterisk bold markers.\n- No long paragraphs. Each bullet must be under 18 words.\n- Do not invent metrics. If a metric is missing, omit it from METRICS.\n- Prefer specific content advice over generic social media tips.`
}

async function generateWithOpenAI(apiKey: string, modelName: string, messages: ReturnType<typeof buildOpenAICompatibleMessages>, temperature: number, maxTokens: number) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: modelName,
            messages,
            temperature,
            max_tokens: maxTokens,
        }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok || data?.error) {
        throw new Error(data?.error?.message || `OpenAI request failed (${response.status})`)
    }

    return extractOpenRouterTextContent(data?.choices?.[0]?.message?.content)
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { messages, workspaceId, assistantContext, assistantIntent } = await req.json()

        // Validate messages
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            throw new Error('Messages array is required')
        }

        const lastMsg = messages[messages.length - 1]
        if (!lastMsg || lastMsg.role !== 'user') {
            throw new Error('Last message must be from user')
        }

        if (!workspaceId) {
            throw new Error('workspaceId is required')
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Supabase configuration missing')
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Resolve AI config via shared helper
        const aiConfig = await resolveAIConfig({ supabase, workspaceId })

        // Fetch brand profile for language
        const { data: brandProfile } = await supabase
            .from('workspace_brand_profiles')
            .select('language, brand_voice, business_name')
            .eq('workspace_id', workspaceId)
            .maybeSingle()

        // Language names mapping
        const LANGUAGE_NAMES: Record<string, string> = {
            en: 'English', es: 'Spanish', fr: 'French', de: 'German',
            it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ar: 'Arabic',
            zh: 'Chinese', ja: 'Japanese', ko: 'Korean', hi: 'Hindi',
            ru: 'Russian', tr: 'Turkish'
        }

        const language = brandProfile?.language || 'en'
        const languageName = LANGUAGE_NAMES[language] || 'English'
        const contextInstruction = formatAssistantContext(assistantContext, assistantIntent)
        const responseContract = formatAssistantResponseContract(assistantIntent)

        const systemInstruction = `You are an expert Social Media Manager AI Assistant. Your role is to help users create engaging content, plan schedules, and analyze social media strategies for platforms like Instagram, Facebook, LinkedIn, and Twitter.

IMPORTANT: Respond in ${languageName} language. All your responses, captions, and content suggestions must be in ${languageName}.

Guidelines:
1. Be concise, professional, and creative.
2. When asked for captions, provide multiple variations (e.g., Short, Funny, Professional) - all in ${languageName}.
3. Suggest relevant hashtags.
4. If asked about technical issues, guide them to the Settings page.
5. Do not just list generic capabilities; actively help them with their specific request.
6. Use emoji where appropriate to match the social media vibe.
7. ALL content must be in ${languageName}.${contextInstruction}${responseContract}`

        let responseText = ""

        if (aiConfig.provider === 'openrouter') {
            responseText = await createOpenRouterChatCompletion({
                apiKey: aiConfig.apiKey,
                modelName: aiConfig.modelName,
                messages: buildOpenAICompatibleMessages(messages, systemInstruction),
                temperature: aiConfig.temperature,
                maxTokens: aiConfig.maxTokens,
            })
        } else if (aiConfig.provider === 'openai') {
            responseText = await generateWithOpenAI(
                aiConfig.apiKey,
                aiConfig.modelName,
                buildOpenAICompatibleMessages(messages, systemInstruction),
                aiConfig.temperature,
                aiConfig.maxTokens,
            )
        } else {
            const genAI = new GoogleGenerativeAI(aiConfig.apiKey)
            const model = genAI.getGenerativeModel({
                model: aiConfig.modelName,
                systemInstruction,
                generationConfig: {
                    temperature: aiConfig.temperature,
                    maxOutputTokens: aiConfig.maxTokens,
                }
            })

            // Google Gemini requires the first message in history to be from 'user'.
            const history = messages.slice(0, -1)
                .filter((m: Message, index: number) => !(index === 0 && m.role === 'assistant'))
                .map((m: Message) => ({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [
                        { text: m.content },
                        ...(m.images || []).map(img => ({
                            inlineData: { mimeType: img.mimeType, data: img.base64 }
                        }))
                    ]
                }))

            const chatSession = model.startChat({ history })
            const lastParts: Array<
                { text: string } |
                { inlineData: { mimeType: string; data: string } }
            > = [
                { text: lastMsg.content },
                ...(lastMsg.images || []).map((img: { mimeType: string; base64: string }) => ({
                    inlineData: { mimeType: img.mimeType, data: img.base64 }
                }))
            ]
            const result = await chatSession.sendMessage(lastParts)
            responseText = result.response.text()
        }

        return new Response(JSON.stringify({ response: responseText }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: unknown) {
        console.error('Chat Assistant Error:', error)
        return new Response(JSON.stringify({ error: toUserFriendlyError(error) }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
