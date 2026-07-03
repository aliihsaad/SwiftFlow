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

interface BrandProfile {
    business_name: string | null
    industry: string | null
    brand_voice: string | null
    target_audience: string | null
    language: string | null
    services?: Array<{ name?: string }>
    unique_selling_points?: string[]
    content_themes?: string[]
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { description, platforms, tone, language, workspaceId } = await req.json()

        if (!workspaceId || workspaceId.trim() === '') {
            throw new Error('workspaceId is required')
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

        // Resolve AI config (key + model) via shared helper
        const aiConfig = await resolveAIConfig({ supabase, workspaceId })

        const platformNames = platforms?.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' and ') || 'Social Media'

        // Fetch brand profile for context
        const { data: brandProfile } = await supabase
            .from('workspace_brand_profiles')
            .select('*')
            .eq('workspace_id', workspaceId)
            .maybeSingle<BrandProfile>()

        // Language names mapping
        const LANGUAGE_NAMES: Record<string, string> = {
            en: 'English', es: 'Spanish', fr: 'French', de: 'German',
            it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ar: 'Arabic',
            zh: 'Chinese', ja: 'Japanese', ko: 'Korean', hi: 'Hindi',
            ru: 'Russian', tr: 'Turkish'
        }

        const brandLanguage = brandProfile?.language || language || 'en'
        const languageName = LANGUAGE_NAMES[brandLanguage] || 'English'

        // Build brand context
        let brandContext = ''
        if (brandProfile) {
            const services = brandProfile.services?.map((s) => s.name).filter(Boolean).join(', ') || ''
            const usps = brandProfile.unique_selling_points?.join(', ') || ''
            const themes = brandProfile.content_themes?.join(', ') || ''

            brandContext = `\nBRAND CONTEXT:
Business: ${brandProfile.business_name || 'Not specified'}
Industry: ${brandProfile.industry || 'Not specified'}
Brand Voice: ${brandProfile.brand_voice || 'professional'}
Target Audience: ${brandProfile.target_audience || 'General audience'}
Language: ${languageName}
${services ? `Services: ${services}` : ''}
${usps ? `USPs: ${usps}` : ''}
${themes ? `Content Themes: ${themes}` : ''}
`
        }

        const prompt = `${brandContext}
Act as a social media expert. Generate 5 distinct caption suggestions for a post on ${platformNames}.

IMPORTANT: Write ALL captions in ${languageName} language.

Topic/Description: "${description}"
Tone: ${brandProfile?.brand_voice || tone || 'professional'}
Language: ${languageName}

Requirements:
- Write all captions in ${languageName}
- Align with the brand voice and target audience above
- Include relevant hashtags
- Use engaging emojis
- Optimize for engagement on the selected platforms
- Keep it concise but impactful
${brandProfile?.business_name ? `- Subtly reflect ${brandProfile.business_name}'s brand identity` : ''}

Return ONLY the captions (in ${languageName}) as a JSON array of strings. No markdown formatting.
    `

        const responseText = requireGeneratedText(await generateText({
            provider: aiConfig.provider,
            apiKey: aiConfig.apiKey,
            modelName: aiConfig.modelName,
            prompt,
            systemInstruction: "You are an expert Social Media Manager AI Assistant. Be concise, professional, and creative. Return strict JSON arrays.",
            temperature: aiConfig.temperature,
            maxTokens: Math.min(aiConfig.maxTokens, 1400),
        }), "Caption suggestions")

        // Clean JSON
        let suggestions = []
        try {
            const cleanResponse = responseText.replace(/```json/g, '').replace(/```/g, '').trim()
            suggestions = JSON.parse(cleanResponse)
        } catch {
            // Fallback split
            suggestions = responseText.split('\n').filter(s => s.trim().length > 0).slice(0, 5)
        }

        return new Response(JSON.stringify({ suggestions }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: unknown) {
        console.error('Generate Caption Error:', redactSensitiveLogValue(error))
        return new Response(JSON.stringify({ error: toUserFriendlyError(error) }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
