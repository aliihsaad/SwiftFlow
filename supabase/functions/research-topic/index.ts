import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { resolveAIConfig, toUserFriendlyError } from "../_shared/ai-config.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { query, workspaceId, context } = await req.json()

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            throw new Error('query is required')
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

        // Fetch brand profile for industry/business context
        const { data: brandProfile } = await supabase
            .from('workspace_brand_profiles')
            .select('business_name, industry, target_audience, language')
            .eq('workspace_id', workspaceId)
            .maybeSingle()

        // Resolve AI config via shared helper
        const aiConfig = await resolveAIConfig({ supabase, workspaceId })

        // Language names mapping
        const LANGUAGE_NAMES: Record<string, string> = {
            en: 'English', es: 'Spanish', fr: 'French', de: 'German',
            it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ar: 'Arabic',
            zh: 'Chinese', ja: 'Japanese', ko: 'Korean', hi: 'Hindi',
            ru: 'Russian', tr: 'Turkish'
        }

        const language = brandProfile?.language || 'en'
        const languageName = LANGUAGE_NAMES[language] || 'English'

        // Build industry context
        let industryContext = ''
        if (brandProfile) {
            industryContext = [
                brandProfile.business_name ? `Business: ${brandProfile.business_name}` : '',
                brandProfile.industry ? `Industry: ${brandProfile.industry}` : '',
                brandProfile.target_audience ? `Target Audience: ${brandProfile.target_audience}` : '',
            ].filter(Boolean).join('\n')
        }

        const genAI = new GoogleGenerativeAI(aiConfig.apiKey)
        const model = genAI.getGenerativeModel({
            model: aiConfig.modelName,
            systemInstruction: `You are a social media research analyst. Your job is to research current trends, news, and popular content topics using Google Search.

${industryContext ? `BUSINESS CONTEXT:\n${industryContext}\n` : ''}

Provide a structured research summary in ${languageName} that includes:
1. Current trending topics related to the query
2. Recent news or events relevant to the field
3. Popular content angles that are performing well on social media
4. Any viral trends or hashtags worth leveraging

Be specific with facts, data points, and real examples. Do NOT make things up — only include information you found from search results.

Format your response as a clear, concise research brief that can be used to inform content creation.`,
            generationConfig: {
                temperature: 0.3, // Low temperature for factual research
                maxOutputTokens: 1500,
            },
            // Enable Google Search Grounding
            tools: [{ googleSearch: {} } as any],
        })

        // Build the research query
        const researchPrompt = context
            ? `Research the following topic for social media content creation: "${query}"\n\nAdditional context: ${context}`
            : `Research the following topic for social media content creation: "${query}"`

        console.log('Research query:', researchPrompt)

        const result = await model.generateContent(researchPrompt)
        const responseText = result.response.text()
        console.log('Research result length:', responseText.length)

        // Extract grounding sources if available
        const groundingMetadata = result.response.candidates?.[0]?.groundingMetadata
        const sources: string[] = []
        if (groundingMetadata?.groundingChunks) {
            for (const chunk of groundingMetadata.groundingChunks) {
                if (chunk.web?.uri) {
                    sources.push(chunk.web.uri)
                }
            }
        }

        return new Response(JSON.stringify({
            research: responseText,
            sources,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error('Research Topic Error:', error)
        return new Response(JSON.stringify({
            error: toUserFriendlyError(error),
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
