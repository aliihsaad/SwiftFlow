import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { resolveAIConfig, toUserFriendlyError } from "../_shared/ai-config.ts"
import { generateText, requireGeneratedText } from "../_shared/generate-text.ts"
import { redactSensitiveLogValue } from "../_shared/log-redaction.ts"
import { assertWorkspaceAccess } from "../_shared/workspace-auth.ts"

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
        const { comment, authorUsername, postContent, platform, workspaceId } = await req.json()

        if (!workspaceId || workspaceId.trim() === '') {
            throw new Error('workspaceId is required')
        }

        if (!comment || comment.trim() === '') {
            throw new Error('comment is required')
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Supabase configuration missing')
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        // Non-internal callers must present a user JWT with workspace membership.
        const unauthorized = await assertWorkspaceAccess(req, supabase, workspaceId, corsHeaders)
        if (unauthorized) return unauthorized

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
        const prompt = buildReplyPrompt({
            comment,
            authorUsername,
            postContent,
            platform,
            brandProfile
        })

        console.log('[generate-reply] Calling AI model...')
        const responseText = await generateText({
            provider: aiConfig.provider,
            apiKey: aiConfig.apiKey,
            modelName,
            prompt,
            temperature: aiConfig.temperature,
            maxTokens: Math.min(aiConfig.maxTokens, 512),
        })
        console.log('[generate-reply] AI response length:', responseText.length)

        const reply = requireGeneratedText(responseText)

        console.log('[generate-reply] Reply generated length:', reply.length)
        return new Response(JSON.stringify({ reply }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error('[generate-reply] Error:', redactSensitiveLogValue(error?.message || error))
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

const LANGUAGE_NAMES: Record<string, string> = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German',
    it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ar: 'Arabic',
    zh: 'Chinese', ja: 'Japanese', ko: 'Korean', hi: 'Hindi',
    ru: 'Russian', tr: 'Turkish'
}

function buildReplyPrompt({
    comment,
    authorUsername,
    postContent,
    platform,
    brandProfile
}: {
    comment: string
    authorUsername: string | null
    postContent: string | null
    platform: string
    brandProfile: BrandProfile | null
}): string {
    const parts: string[] = []

    parts.push('Generate a friendly, engaging reply to this social media comment.')
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
        parts.push('')
    }

    parts.push('=== COMMENT DETAILS ===')
    parts.push(`Platform: ${platform}`)
    if (authorUsername) {
        parts.push(`Commenter: @${authorUsername}`)
    }
    parts.push(`Comment: "${comment}"`)

    if (postContent) {
        parts.push('')
        parts.push('=== ORIGINAL POST CONTEXT ===')
        parts.push(postContent)
    }

    const language = brandProfile?.language || 'en'
    const languageName = LANGUAGE_NAMES[language] || 'English'

    parts.push('')
    parts.push('=== INSTRUCTIONS ===')
    parts.push(`- IMPORTANT: Write the reply in ${languageName} language`)
    parts.push('- Write a personalized reply that matches the brand voice')
    parts.push('- Be warm, authentic, and engaging')
    parts.push('- Keep it concise (1-3 sentences max)')
    parts.push('- Use appropriate emojis sparingly if it fits the tone')
    parts.push('- Address the commenter by name if appropriate')
    parts.push('- If they asked a question, answer it helpfully')
    parts.push('- If they gave positive feedback, thank them genuinely')
    parts.push('- If they expressed concern, acknowledge it empathetically')
    parts.push('- Do NOT use hashtags in replies')
    parts.push('- Do NOT be overly promotional')
    parts.push('')
    parts.push(`Reply only with the response text in ${languageName}, nothing else:`)

    return parts.join('\n')
}
