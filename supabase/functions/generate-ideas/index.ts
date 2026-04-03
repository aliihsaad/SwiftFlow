import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { invokeEdgeFunction } from "../_shared/edge-invoke.ts"
import { resolveAIConfig, toUserFriendlyError } from "../_shared/ai-config.ts"
import { generateText, requireGeneratedText } from "../_shared/generate-text.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Message {
    role: 'user' | 'assistant'
    content: string
}

function serializeConversationHistory(messages: Message[]): string {
    const lines = messages
        .filter((m, index) => !(index === 0 && m.role === 'assistant'))
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)

    return lines.length ? lines.join('\n') : 'No prior conversation.'
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { messages, workspaceId, research, researchQuery } = await req.json()

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

        // Fetch brand profile for context
        const { data: brandProfile, error: brandError } = await supabase
            .from('workspace_brand_profiles')
            .select('*')
            .eq('workspace_id', workspaceId)
            .maybeSingle()

        if (brandError) {
            console.error('Brand profile error:', brandError)
        }

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

        // Build brand context for system instruction
        let brandContext = ''
        if (brandProfile) {
            brandContext = `
BRAND CONTEXT:
${brandProfile.business_name ? `Business: ${brandProfile.business_name}` : ''}
${brandProfile.industry ? `Industry: ${brandProfile.industry}` : ''}
${brandProfile.business_description ? `About: ${brandProfile.business_description}` : ''}
${brandProfile.target_audience ? `Target Audience: ${brandProfile.target_audience}` : ''}
${brandProfile.brand_voice ? `Brand Voice: ${brandProfile.brand_voice}` : ''}
${brandProfile.unique_selling_points?.length ? `USPs: ${brandProfile.unique_selling_points.join(', ')}` : ''}
${brandProfile.content_themes?.length ? `Content Themes: ${brandProfile.content_themes.join(', ')}` : ''}
Language: ${languageName}

IMPORTANT: Generate ALL content in ${languageName} language.
Use this brand context to generate highly relevant, on-brand content ideas.
`
        }

        // --- Research Phase (optional) ---
        let researchContext = ''
        if (research) {
            console.log('Research mode enabled, calling research-topic...')
            const researchResult = await invokeEdgeFunction('research-topic', {
                query: researchQuery || brandProfile?.industry || lastMsg.content,
                workspaceId,
                context: brandProfile?.business_name ? `For ${brandProfile.business_name} in ${brandProfile.industry || 'their industry'}` : undefined,
            })

            if (researchResult.ok && researchResult.data?.research) {
                researchContext = `\nRESEARCH FINDINGS (from real-time Google Search):\n${researchResult.data.research}\n\nUse these research findings to inform your content ideas. Reference specific trends, news, or data points from the research.\n`
                console.log('Research completed, findings length:', researchResult.data.research.length)
            } else {
                console.warn('Research failed or returned empty:', researchResult.error)
            }
        }

        const systemInstruction = `You are a Social Media Content Strategist.

            ${brandContext}
            ${researchContext}

            Your goal is to generate high-quality, engaging content ideas based on the user's input.

            IMPORTANT: Generate ALL content (titles, body text) in ${languageName} language.

            RETURN JSON ONLY. The response must match this schema:
            {
              "type": "content_cards",
              "data": [
                {
                  "id": "unique_string",
                  "title": "Catchy Hook or Title in ${languageName}",
                  "body": "The main caption or content summary in ${languageName}...",
                  "platform": "instagram" | "facebook" | "linkedin" | "twitter"
                }
              ]
            }

            Guidelines:
            1. Title should be punchy and scroll-stopping (in ${languageName}).
            2. Body should be actionable and align with the brand voice (in ${languageName}).
            3. Provide the number of ideas requested by the user (default to 5 if not specified).
            4. Tailor content to the target audience and industry.
            5. ALL text content MUST be in ${languageName}.
            ${research ? '6. IMPORTANT: Base your ideas on the RESEARCH FINDINGS above. Reference current trends, real events, and data points.' : ''}`

        const prompt = `CONVERSATION HISTORY:
${serializeConversationHistory(messages.slice(0, -1))}

LATEST USER REQUEST:
${lastMsg.content}

Return valid JSON only.`

        const responseText = requireGeneratedText(await generateText({
            provider: aiConfig.provider,
            apiKey: aiConfig.apiKey,
            modelName: aiConfig.modelName,
            prompt,
            systemInstruction,
            temperature: 0.8,
            maxTokens: Math.min(aiConfig.maxTokens, 2200),
        }), "Content ideas")
        console.log('Raw AI Response:', responseText)

        let parsedResult
        try {
            // Clean markdown backticks if present
            const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim()
            const jsonStart = cleanText.indexOf('{')
            const jsonEnd = cleanText.lastIndexOf('}')

            if (jsonStart !== -1 && jsonEnd !== -1) {
                parsedResult = JSON.parse(cleanText.substring(jsonStart, jsonEnd + 1))
            } else {
                parsedResult = JSON.parse(cleanText)
            }
        } catch {
            // Fallback if model failed to produce valid JSON
            parsedResult = { type: "text", message: responseText }
        }

        return new Response(JSON.stringify({ result: parsedResult }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: unknown) {
        console.error('Generate Ideas Error:', error)
        return new Response(JSON.stringify({ error: toUserFriendlyError(error) }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
