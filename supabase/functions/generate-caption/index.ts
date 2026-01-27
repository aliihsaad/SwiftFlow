import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

        // Create Supabase client (simplified - no RLS)
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Supabase configuration missing')
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Fetch workspace settings
        const { data: settings, error: settingsError } = await supabase
            .from('workspace_settings')
            .select('*')
            .eq('workspace_id', workspaceId)
            .maybeSingle()

        if (settingsError) {
            console.error('Settings error:', settingsError)
        }

        // Get API key from settings (fallback to env if not set in DB)
        const apiKey = settings?.gemini_api_key || Deno.env.get('GEMINI_API_KEY')
        if (!apiKey) {
            throw new Error('Gemini API key not configured. Please add it in Settings > AI Provider')
        }

        const modelName = settings?.ai_model_name || 'gemini-1.5-flash'

        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: "You are an expert Social Media Manager AI Assistant. Be concise, professional, and creative. Return strict JSON arrays."
        })

        const platformNames = platforms?.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' and ') || 'Social Media'

        // Fetch brand profile for context
        const { data: brandProfile } = await supabase
            .from('workspace_brand_profiles')
            .select('*')
            .eq('workspace_id', workspaceId)
            .maybeSingle()

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
            const services = brandProfile.services?.map((s: any) => s.name).join(', ') || ''
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

        const result = await model.generateContent(prompt)
        const responseText = result.response.text()

        // Clean JSON
        let suggestions = []
        try {
            const cleanResponse = responseText.replace(/```json/g, '').replace(/```/g, '').trim()
            suggestions = JSON.parse(cleanResponse)
        } catch (e) {
            // Fallback split
            suggestions = responseText.split('\n').filter(s => s.trim().length > 0).slice(0, 5)
        }

        return new Response(JSON.stringify({ suggestions }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error('API Error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200, // Return 200 so client doesn't throw automatically
        })
    }
})
