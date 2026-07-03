import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decryptSecretIfNeeded } from "../_shared/secret-crypto.ts"
import { toUserFriendlyError } from "../_shared/ai-config.ts"
import { redactSensitiveLogValue } from "../_shared/log-redaction.ts"
import { assertWorkspaceAccess } from "../_shared/workspace-auth.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface BrandProfileRow {
    business_name?: string | null
    industry?: string | null
    target_audience?: string | null
    language?: string | null
}

interface WorkspaceSettingsRow {
    ai_provider?: string | null
    ai_text_model_name?: string | null
    ai_model_name?: string | null
    gemini_api_key?: string | null
}

function normalizeApiKey(value: unknown): string {
    return String(value || "").trim().replace(/^['"]|['"]$/g, "")
}

function normalizeGeminiModelName(value: unknown): string {
    const model = String(value || "").trim()
    if (!model) return "gemini-2.5-flash"
    return model.replace(/^models\//, "")
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    try {
        const { query, workspaceId, context } = await req.json()

        if (!query || typeof query !== "string" || query.trim().length === 0) {
            throw new Error("query is required")
        }

        if (!workspaceId) {
            throw new Error("workspaceId is required")
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error("Supabase configuration missing")
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        // Non-internal callers must present a user JWT with workspace membership.
        const unauthorized = await assertWorkspaceAccess(req, supabase, workspaceId, corsHeaders)
        if (unauthorized) return unauthorized

        const { data: brandProfile } = await supabase
            .from("workspace_brand_profiles")
            .select("business_name, industry, target_audience, language")
            .eq("workspace_id", workspaceId)
            .maybeSingle<BrandProfileRow>()

        const { data: workspaceSettings } = await supabase
            .from("workspace_settings")
            .select("ai_provider, ai_text_model_name, ai_model_name, gemini_api_key")
            .eq("workspace_id", workspaceId)
            .maybeSingle<WorkspaceSettingsRow>()

        const geminiWorkspaceKey = normalizeApiKey(await decryptSecretIfNeeded(workspaceSettings?.gemini_api_key))
        const geminiEnvKey = normalizeApiKey(Deno.env.get("GEMINI_API_KEY"))
        const geminiApiKey = geminiWorkspaceKey || geminiEnvKey

        if (!geminiApiKey) {
            throw new Error(
                "Research mode currently requires a Gemini API key because grounded web search has not been finalized for the OpenRouter-first migration. Add a Gemini key or disable research mode.",
            )
        }

        const LANGUAGE_NAMES: Record<string, string> = {
            en: "English",
            es: "Spanish",
            fr: "French",
            de: "German",
            it: "Italian",
            pt: "Portuguese",
            nl: "Dutch",
            ar: "Arabic",
            zh: "Chinese",
            ja: "Japanese",
            ko: "Korean",
            hi: "Hindi",
            ru: "Russian",
            tr: "Turkish",
        }

        const language = brandProfile?.language || "en"
        const languageName = LANGUAGE_NAMES[language] || "English"

        const industryContext = [
            brandProfile?.business_name ? `Business: ${brandProfile.business_name}` : "",
            brandProfile?.industry ? `Industry: ${brandProfile.industry}` : "",
            brandProfile?.target_audience ? `Target Audience: ${brandProfile.target_audience}` : "",
        ]
            .filter(Boolean)
            .join("\n")

        const modelName =
            workspaceSettings?.ai_provider === "gemini"
                ? normalizeGeminiModelName(workspaceSettings.ai_text_model_name || workspaceSettings.ai_model_name)
                : "gemini-2.5-flash"

        const genAI = new GoogleGenerativeAI(geminiApiKey)
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: `You are a social media research analyst. Your job is to research current trends, news, and popular content topics using Google Search.

${industryContext ? `BUSINESS CONTEXT:\n${industryContext}\n` : ""}

Provide a structured research summary in ${languageName} that includes:
1. Current trending topics related to the query
2. Recent news or events relevant to the field
3. Popular content angles that are performing well on social media
4. Any viral trends or hashtags worth leveraging

Be specific with facts, data points, and real examples. Do NOT make things up — only include information you found from search results.

Format your response as a clear, concise research brief that can be used to inform content creation.`,
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1500,
            },
            tools: [{ googleSearch: {} } as never],
        })

        const researchPrompt = context
            ? `Research the following topic for social media content creation: "${query}"\n\nAdditional context: ${context}`
            : `Research the following topic for social media content creation: "${query}"`

        const result = await model.generateContent(researchPrompt)
        const responseText = result.response.text()
        const groundingMetadata = result.response.candidates?.[0]?.groundingMetadata as
            | { groundingChunks?: Array<{ web?: { uri?: string } }> }
            | undefined

        const sources: string[] = []
        for (const chunk of groundingMetadata?.groundingChunks || []) {
            if (chunk.web?.uri) {
                sources.push(chunk.web.uri)
            }
        }

        return new Response(
            JSON.stringify({
                research: responseText,
                sources,
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        )
    } catch (error: unknown) {
        console.error("Research Topic Error:", redactSensitiveLogValue(error))
        return new Response(
            JSON.stringify({
                error: toUserFriendlyError(error),
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            },
        )
    }
})
