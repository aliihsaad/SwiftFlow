import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { resolveAIConfig, toUserFriendlyError } from "../_shared/ai-config.ts"
import { generateText, requireGeneratedText } from "../_shared/generate-text.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEMINI_REPLY_MODEL = 'gemini-2.0-flash'

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { message, participantUsername, conversationHistory, platform, workspaceId } = await req.json()

        if (!workspaceId || workspaceId.trim() === '') {
            throw new Error('workspaceId is required')
        }

        if (!message || message.trim() === '') {
            throw new Error('message is required')
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Supabase configuration missing')
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Resolve AI config via shared helper
        const aiConfig = await resolveAIConfig({ supabase, workspaceId })
        const modelName = aiConfig.provider === 'gemini' ? GEMINI_REPLY_MODEL : aiConfig.modelName

        // Fetch brand profile for context
        const { data: brandProfile } = await supabase
            .from('workspace_brand_profiles')
            .select('business_name, business_description, brand_voice, target_audience, industry, language')
            .eq('workspace_id', workspaceId)
            .maybeSingle()

        // Build prompt
        const prompt = buildMessageReplyPrompt({
            message,
            participantUsername,
            conversationHistory,
            platform,
            brandProfile
        })

        console.log('[generate-message-reply] Calling AI model...')
        const responseText = await generateText({
            provider: aiConfig.provider,
            apiKey: aiConfig.apiKey,
            modelName,
            prompt,
            temperature: aiConfig.temperature,
            maxTokens: Math.min(aiConfig.maxTokens, 600),
        })
        console.log('[generate-message-reply] AI response length:', responseText.length)

        const reply = requireGeneratedText(responseText)

        console.log('[generate-message-reply] Reply:', reply.substring(0, 100))
        return new Response(JSON.stringify({ reply }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error('[generate-message-reply] Error:', error?.message || error)
        return new Response(JSON.stringify({ error: toUserFriendlyError(error) }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})

interface BrandProfile {
    business_name: string | null
    business_description: string | null
    brand_voice: string | null
    target_audience: string | null
    industry: string | null
    language: string | null
}

interface ConversationMessage {
    message: string | null
    is_from_page: boolean
}

const LANGUAGE_NAMES: Record<string, string> = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German',
    it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ar: 'Arabic',
    zh: 'Chinese', ja: 'Japanese', ko: 'Korean', hi: 'Hindi',
    ru: 'Russian', tr: 'Turkish'
}

function buildMessageReplyPrompt({
    message,
    participantUsername,
    conversationHistory,
    platform,
    brandProfile
}: {
    message: string
    participantUsername: string | null
    conversationHistory: ConversationMessage[] | null
    platform: string
    brandProfile: BrandProfile | null
}): string {
    const parts: string[] = []

    parts.push('Generate a helpful, professional reply to this Instagram Direct Message on behalf of a business.')
    parts.push('')

    if (brandProfile) {
        parts.push('=== BRAND CONTEXT ===')
        if (brandProfile.business_name) {
            parts.push(`Business: ${brandProfile.business_name}`)
        }
        if (brandProfile.industry) {
            parts.push(`Industry: ${brandProfile.industry}`)
        }
        if (brandProfile.brand_voice) {
            parts.push(`Brand Voice/Tone: ${brandProfile.brand_voice}`)
        }
        if (brandProfile.business_description) {
            parts.push(`About: ${brandProfile.business_description}`)
        }
        if (brandProfile.target_audience) {
            parts.push(`Target Audience: ${brandProfile.target_audience}`)
        }
        parts.push('')
    }

    // Include conversation history for context
    if (conversationHistory && conversationHistory.length > 0) {
        parts.push('=== CONVERSATION HISTORY (recent messages) ===')
        for (const msg of conversationHistory) {
            if (msg.message) {
                const sender = msg.is_from_page ? 'You (Business)' : (participantUsername ? `@${participantUsername}` : 'Customer')
                parts.push(`${sender}: "${msg.message}"`)
            }
        }
        parts.push('')
    }

    parts.push('=== LATEST MESSAGE TO REPLY TO ===')
    parts.push(`Platform: ${platform}`)
    if (participantUsername) {
        parts.push(`From: @${participantUsername}`)
    }
    parts.push(`Message: "${message}"`)

    const language = brandProfile?.language || 'en'
    const languageName = LANGUAGE_NAMES[language] || 'English'

    parts.push('')
    parts.push('=== INSTRUCTIONS ===')
    parts.push(`- IMPORTANT: Write the reply in ${languageName} language`)
    parts.push('- This is a private Direct Message, not a public comment — be conversational and personal')
    parts.push('- Match the brand voice and tone')
    parts.push('- Be helpful, friendly, and professional')
    parts.push('- Keep it concise (1-3 sentences)')
    parts.push('- If they asked a question, provide a clear answer or offer to help further')
    parts.push('- If they are inquiring about products/services, be informative but not pushy')
    parts.push('- If they have a complaint, be empathetic and solution-oriented')
    parts.push('- If they said something positive, thank them warmly')
    parts.push('- Use emojis sparingly if it fits the brand tone')
    parts.push('- Do NOT use hashtags in DMs')
    parts.push('- Do NOT be overly formal or robotic')
    parts.push('- Consider the conversation history for context if provided')
    parts.push('')
    parts.push(`Reply only with the response text in ${languageName}, nothing else:`)

    return parts.join('\n')
}
