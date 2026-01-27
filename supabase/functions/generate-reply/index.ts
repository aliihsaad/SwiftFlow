import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

        // Create Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Supabase configuration missing')
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Fetch workspace settings
        const { data: settings } = await supabase
            .from('workspace_settings')
            .select('*')
            .eq('workspace_id', workspaceId)
            .maybeSingle()

        // Get API key
        const apiKey = settings?.gemini_api_key || Deno.env.get('GEMINI_API_KEY')
        if (!apiKey) {
            throw new Error('Gemini API key not configured. Please add it in Settings > AI Provider')
        }

        const modelName = settings?.ai_model_name || 'gemini-1.5-flash'

        // Fetch brand profile for context
        const { data: brandProfile } = await supabase
            .from('workspace_brand_profiles')
            .select('business_name, business_description, brand_voice, target_audience, industry')
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

        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 256,
            }
        })

        const result = await model.generateContent(prompt)
        const responseText = result.response.text()

        // Clean up the reply
        const reply = responseText
            .replace(/^["']|["']$/g, '')
            .replace(/^Reply:\s*/i, '')
            .trim()

        return new Response(JSON.stringify({ reply }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error('Generate reply error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
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

    parts.push('')
    parts.push('=== INSTRUCTIONS ===')
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
    parts.push('Reply only with the response text, nothing else:')

    return parts.join('\n')
}
