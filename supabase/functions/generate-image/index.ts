import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { resolveAIConfig, toUserFriendlyError } from "../_shared/ai-config.ts"
import { redactSensitiveLogValue } from "../_shared/log-redaction.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface ReferenceImage {
    base64: string
    mimeType: string
}

interface BrandColors {
    enabled?: boolean
    primary?: string
    secondary?: string
    accent?: string
}

interface BrandProfileRow {
    brand_colors?: BrandColors | null
    business_name?: string | null
}

interface AutomationAttachContext {
    postId: string
    runId: string
    automationId: string
}

interface PublishingAutomationRunRow {
    result_snapshot?: Record<string, unknown> | null
}

interface GoogleErrorDetail {
    reason?: string
}

interface GoogleErrorPayload {
    error?: {
        status?: string
        message?: string
        details?: GoogleErrorDetail[]
    }
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string
                inlineData?: { mimeType?: string; data?: string }
            }>
        }
    }>
    promptFeedback?: {
        blockReason?: string
    }
}

interface OpenRouterModelRecord {
    id?: string
    architecture?: {
        output_modalities?: string[]
    }
}

function normalizeApiKey(value: unknown): string {
    return String(value || "").trim().replace(/^['"]|['"]$/g, "")
}

function normalizeAttachContext(value: {
    attachToPostId?: unknown
    automationRunId?: unknown
    automationId?: unknown
}): AutomationAttachContext | null {
    const postId = typeof value.attachToPostId === "string" ? value.attachToPostId.trim() : ""
    const runId = typeof value.automationRunId === "string" ? value.automationRunId.trim() : ""
    const automationId = typeof value.automationId === "string" ? value.automationId.trim() : ""
    return postId && runId && automationId ? { postId, runId, automationId } : null
}

function asGooglePayload(value: unknown): GoogleErrorPayload | null {
    return value && typeof value === "object" ? (value as GoogleErrorPayload) : null
}

async function markAutomationImageFailure(params: {
    supabase: ReturnType<typeof createClient>
    attachContext: AutomationAttachContext | null
    message: string
}) {
    if (!params.attachContext) return

    await params.supabase
        .from("publishing_automation_runs")
        .update({
            status: "failed",
            error_message: params.message,
            finished_at: new Date().toISOString(),
        })
        .eq("id", params.attachContext.runId)

    await params.supabase
        .from("publishing_automations")
        .update({
            last_error: params.message,
            updated_at: new Date().toISOString(),
        })
        .eq("id", params.attachContext.automationId)
}

async function attachGeneratedImageToAutomationDraft(params: {
    supabase: ReturnType<typeof createClient>
    workspaceId: string
    attachContext: AutomationAttachContext | null
    imageUrl: string
}) {
    if (!params.attachContext) return

    const { data: run, error: runError } = await params.supabase
        .from("publishing_automation_runs")
        .select("result_snapshot")
        .eq("id", params.attachContext.runId)
        .eq("workspace_id", params.workspaceId)
        .eq("publishing_automation_id", params.attachContext.automationId)
        .maybeSingle<PublishingAutomationRunRow>()

    if (runError) throw runError

    const mediaUrls = [params.imageUrl]
    const { error: postUpdateError } = await params.supabase
        .from("posts")
        .update({
            media_urls: mediaUrls,
            updated_at: new Date().toISOString(),
        })
        .eq("id", params.attachContext.postId)
        .eq("workspace_id", params.workspaceId)
        .eq("source_publishing_automation_run_id", params.attachContext.runId)

    if (postUpdateError) throw postUpdateError

    const currentSnapshot = run?.result_snapshot && typeof run.result_snapshot === "object" && !Array.isArray(run.result_snapshot)
        ? run.result_snapshot
        : {}

    const { error: runUpdateError } = await params.supabase
        .from("publishing_automation_runs")
        .update({
            status: "completed",
            result_snapshot: {
                ...currentSnapshot,
                media_urls: mediaUrls,
                post_id: params.attachContext.postId,
            },
            finished_at: new Date().toISOString(),
        })
        .eq("id", params.attachContext.runId)
        .eq("workspace_id", params.workspaceId)

    if (runUpdateError) throw runUpdateError

    const { error: automationUpdateError } = await params.supabase
        .from("publishing_automations")
        .update({
            last_run_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", params.attachContext.automationId)
        .eq("workspace_id", params.workspaceId)

    if (automationUpdateError) throw automationUpdateError
}

function getGoogleErrorInfo(payload: unknown): { reason: string; message: string } {
    const normalized = asGooglePayload(payload)
    const details = Array.isArray(normalized?.error?.details) ? normalized.error.details : []
    const reason = details.find((detail) => typeof detail?.reason === "string")?.reason || normalized?.error?.status || "UNKNOWN"
    const message = String(normalized?.error?.message || "")
    return { reason, message }
}

function buildReferenceInstruction(
    textPrompt: string,
    referenceMode?: string,
    brandImageMode?: string,
    transformAction?: string,
): string {
    if (brandImageMode === "transform" && transformAction) {
        const transformInstructions: Record<string, string> = {
            restyle: "Restyle the uploaded image(s) while keeping the subject and composition. Apply the described style.",
            "add-brand-colors": "Modify the uploaded image(s) to incorporate the brand colors while maintaining the original composition.",
            modernize: "Modernize the uploaded image(s) with a contemporary, clean aesthetic while preserving the core subject.",
            simplify: "Simplify the uploaded image(s) by reducing visual complexity while keeping the key elements recognizable.",
        }
        return `${transformInstructions[transformAction] || "Transform the uploaded image(s) as described."} ${textPrompt}`
    }

    if (referenceMode) {
        const referenceInstructions: Record<string, string> = {
            "match-style": "Generate a new image that matches the visual style, textures, and artistic approach of the reference images.",
            "match-colors": "Generate a new image using the color palette from the reference images.",
            "use-as-template": "Generate a new image using the reference images as compositional templates for layout and structure.",
            "inspired-by": "Generate a new image inspired by the mood, feel, and aesthetic of the reference images.",
        }
        return `${referenceInstructions[referenceMode] || "Use the reference images as guidance for the new image."} ${textPrompt}`
    }

    return textPrompt
}

function buildOpenRouterImageMessage(
    textPrompt: string,
    referenceImages?: ReferenceImage[],
    referenceMode?: string,
    brandImageMode?: string,
    transformAction?: string,
): Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> {
    const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
        {
            type: "text",
            text: buildReferenceInstruction(textPrompt, referenceMode, brandImageMode, transformAction),
        },
    ]

    for (const image of referenceImages || []) {
        parts.push({
            type: "image_url",
            image_url: { url: `data:${image.mimeType || "image/jpeg"};base64,${image.base64}` },
        })
    }

    return parts
}

function buildGeminiContentParts(
    textPrompt: string,
    referenceImages?: ReferenceImage[],
    referenceMode?: string,
    brandImageMode?: string,
    transformAction?: string,
): Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> {
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = []

    if (Array.isArray(referenceImages) && referenceImages.length > 0) {
        for (const image of referenceImages) {
            parts.push({
                inlineData: {
                    mimeType: image.mimeType || "image/jpeg",
                    data: image.base64,
                },
            })
        }

        parts.push({
            text: buildReferenceInstruction(textPrompt, referenceMode, brandImageMode, transformAction),
        })
        return parts
    }

    parts.push({ text: textPrompt })
    return parts
}

async function fetchOpenRouterImageModels(apiKey: string): Promise<string[]> {
    const queries = ["?output_modalities=image", "?output_modality=image", ""]
    const fallbackPreferred = [
        "google/gemini-2.5-flash-image",
        "google/gemini-3.1-flash-image-preview",
        "openai/gpt-5-image-mini",
        "openai/gpt-5-image",
        "google/gemini-3-pro-image-preview",
        "black-forest-labs/flux.2-flex",
        "black-forest-labs/flux.2-max",
        "black-forest-labs/flux.2-klein-4b",
    ]
    let discovered: string[] = []

    for (const suffix of queries) {
        const response = await fetch(`https://openrouter.ai/api/v1/models${suffix}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
        })

        const payload = await response.json().catch(() => ({} as Record<string, unknown>))
        if (!response.ok) {
            continue
        }

        const rows = Array.isArray((payload as { data?: unknown[] }).data)
            ? ((payload as { data: unknown[] }).data as OpenRouterModelRecord[])
            : []

        discovered = rows
            .map((row) => {
                const id = String(row?.id || "").trim()
                const outputModalities = Array.isArray(row?.architecture?.output_modalities)
                    ? row.architecture.output_modalities.map((entry) => String(entry || "").trim().toLowerCase())
                    : []
                return id && outputModalities.includes("image") ? id : ""
            })
            .filter(Boolean)

        if (discovered.length > 0) {
            break
        }
    }

    return Array.from(new Set([...fallbackPreferred, ...discovered]))
}

async function generateWithOpenRouterImage(params: {
    apiKey: string
    modelName: string
    prompt: string
    referenceImages?: ReferenceImage[]
    referenceMode?: string
    brandImageMode?: string
    transformAction?: string
}): Promise<{ imageUrl: string; usedModel: string }> {
    const discoveredModels = await fetchOpenRouterImageModels(params.apiKey).catch(() => [] as string[])
    const modelCandidates = Array.from(
        new Set([
            params.modelName,
            ...discoveredModels,
            "openai/gpt-5-image-mini",
            "openai/gpt-5-image",
            "google/gemini-2.5-flash-image",
            "google/gemini-3-pro-image-preview",
            "google/gemini-3.1-flash-image-preview",
            "black-forest-labs/flux.2-flex",
            "black-forest-labs/flux.2-max",
            "black-forest-labs/flux.2-klein-4b",
            "google/gemini-2.5-flash-image-preview",
        ]),
    )

    let lastError = ""

    for (const candidate of modelCandidates) {
        console.log(`[generate-image] trying OpenRouter candidate=${candidate}`)
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${params.apiKey}`,
            },
            body: JSON.stringify({
                model: candidate,
                messages: [
                    {
                        role: "user",
                        content: buildOpenRouterImageMessage(
                            params.prompt,
                            params.referenceImages,
                            params.referenceMode,
                            params.brandImageMode,
                            params.transformAction,
                        ),
                    },
                ],
                modalities: candidate.startsWith("black-forest-labs/") ? ["image"] : ["image", "text"],
                image_config: { aspect_ratio: "1:1" },
                stream: false,
            }),
        })

        const data = await response.json().catch(() => ({} as Record<string, unknown>))
        const choices = Array.isArray((data as { choices?: unknown[] }).choices) ? (data as { choices: unknown[] }).choices : []
        const firstChoice = choices[0] as {
            message?: {
                images?: Array<{
                    image_url?: { url?: string }
                    imageUrl?: { url?: string }
                }>
                content?: string
            }
        } | undefined
        const firstImage = firstChoice?.message?.images?.[0]
        const imageUrl = firstImage?.image_url?.url || firstImage?.imageUrl?.url
        const providerError = (data as { error?: { message?: string } }).error?.message || `OpenRouter image generation failed (${response.status})`

        if (response.ok && !(data as { error?: { message?: string } }).error && imageUrl) {
            console.log(`[generate-image] OpenRouter succeeded with candidate=${candidate}`)
            return { imageUrl, usedModel: candidate }
        }

        if (response.ok && !(data as { error?: { message?: string } }).error && !imageUrl) {
            console.error("[generate-image] OpenRouter returned no image payload", redactSensitiveLogValue({
                candidate,
                hasChoices: choices.length > 0,
                messageContent: firstChoice?.message?.content || null,
                imageKeys: firstImage ? Object.keys(firstImage) : [],
            }))
        } else {
            console.error("[generate-image] OpenRouter candidate failed", redactSensitiveLogValue({
                candidate,
                status: response.status,
                providerError,
            }))
        }

        lastError = providerError

        if (/No endpoints found for|model not found|not available|provider returned error|provider error|temporarily unavailable|upstream error|internal error/i.test(providerError)) {
            continue
        }

        throw new Error(providerError)
    }

    throw new Error(lastError || "OpenRouter image generation failed.")
}

async function generateWithOpenAIImage(params: {
    apiKey: string
    modelName: string
    prompt: string
}): Promise<{ imageUrl: string; usedModel: string }> {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${params.apiKey}`,
        },
        body: JSON.stringify({
            model: params.modelName,
            prompt: params.prompt,
            size: "1024x1024",
            response_format: "b64_json",
        }),
    })

    const data = await response.json().catch(() => ({} as Record<string, unknown>))
    const resultRows = Array.isArray((data as { data?: unknown[] }).data) ? (data as { data: unknown[] }).data : []
    const firstRow = resultRows[0] as { b64_json?: string; url?: string } | undefined
    const imageUrl =
        typeof firstRow?.url === "string" && firstRow.url
            ? firstRow.url
            : typeof firstRow?.b64_json === "string" && firstRow.b64_json
                ? `data:image/png;base64,${firstRow.b64_json}`
                : ""

    if (!response.ok || (data as { error?: { message?: string } }).error) {
        throw new Error((data as { error?: { message?: string } }).error?.message || `OpenAI image generation failed (${response.status})`)
    }

    if (!imageUrl) {
        throw new Error("OpenAI did not return image data.")
    }

    return { imageUrl, usedModel: params.modelName }
}

async function generateWithGeminiImage(params: {
    primaryKey: string
    fallbackKey: string | null
    modelName: string
    prompt: string
    referenceImages?: ReferenceImage[]
    referenceMode?: string
    brandImageMode?: string
    transformAction?: string
}): Promise<{ imageUrl: string; usedModel: string }> {
    const modelCandidates = Array.from(
        new Set([
            params.modelName,
            "gemini-2.5-flash-image",
            "gemini-3-pro-image-preview",
            "gemini-2.0-flash-preview-image-generation",
        ]),
    )
    const tried = new Set<string>()
    let payload: GoogleErrorPayload | null = null
    let lastError = ""
    let successfulModel = params.modelName

    const executeWithKey = async (apiKey: string): Promise<string | null> => {
        for (const candidate of modelCandidates) {
            if (tried.has(`${candidate}:${apiKey}`)) continue
            tried.add(`${candidate}:${apiKey}`)

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [
                            {
                                parts: buildGeminiContentParts(
                                    params.prompt,
                                    params.referenceImages,
                                    params.referenceMode,
                                    params.brandImageMode,
                                    params.transformAction,
                                ),
                            },
                        ],
                        generationConfig: {
                            responseModalities: ["Text", "Image"],
                            imageConfig: {
                                aspectRatio: "1:1",
                                imageSize: "1K",
                            },
                        },
                    }),
                },
            )

            const rawText = await response.text()
            let parsedPayload: GoogleErrorPayload | null = null
            try {
                parsedPayload = rawText ? (JSON.parse(rawText) as GoogleErrorPayload) : null
            } catch {
                parsedPayload = null
            }

            if (response.ok) {
                payload = parsedPayload
                successfulModel = candidate
                const parts = parsedPayload?.candidates?.[0]?.content?.parts || []
                for (const part of parts) {
                    if (part.inlineData?.data) {
                        return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`
                    }
                }

                const textPart = parts.find((part) => typeof part.text === "string" && part.text)
                if (textPart?.text) {
                    throw new Error(`Model returned text instead of image: "${textPart.text}"`)
                }

                throw new Error("No image data found in Gemini response.")
            }

            const info = getGoogleErrorInfo(parsedPayload)
            lastError = `Gemini API Error (${response.status}) [${info.reason}] ${info.message || rawText}`

            if (/NOT_FOUND|MODEL_NOT_FOUND|FAILED_PRECONDITION|UNIMPLEMENTED|unsupported/i.test(info.reason + " " + info.message)) {
                continue
            }

            if (/API_KEY_INVALID|PERMISSION_DENIED|INVALID_ARGUMENT/i.test(info.reason + " " + info.message)) {
                return null
            }

            return null
        }

        return null
    }

    const primaryResult = await executeWithKey(params.primaryKey)
    const imageUrl = primaryResult || (params.fallbackKey ? await executeWithKey(params.fallbackKey) : null)

    if (!imageUrl) {
        const blockReason = payload?.promptFeedback?.blockReason
        throw new Error(toUserFriendlyError(new Error(blockReason || lastError || "Gemini image generation failed.")))
    }

    return {
        imageUrl,
        usedModel: successfulModel,
    }
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    let supabase: ReturnType<typeof createClient> | null = null
    let attachContext: AutomationAttachContext | null = null

    try {
        const requestBody = await req.json()
        const { messages, workspaceId, prompt, style, referenceImages, referenceMode, brandImageMode, transformAction } = requestBody
        attachContext = normalizeAttachContext(requestBody)
        const lastMsg = messages ? messages[messages.length - 1] : { content: prompt || "Generate an image" }

        if (!workspaceId) {
            throw new Error("workspaceId is required for image generation.")
        }

        supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
        const aiConfig = await resolveAIConfig({ supabase, workspaceId, capability: "image" })
        const primaryKey = aiConfig.apiKey
        const envKey = normalizeApiKey(Deno.env.get("GEMINI_API_KEY"))
        const fallbackKey = aiConfig.provider === "gemini" && aiConfig.keySource === "workspace_settings" && envKey && envKey !== primaryKey ? envKey : null

        const { data: brandProfile } = await supabase
            .from("workspace_brand_profiles")
            .select("brand_colors, business_name")
            .eq("workspace_id", workspaceId)
            .maybeSingle<BrandProfileRow>()

        const colors = brandProfile?.brand_colors || null
        const shouldUseBrandColors = colors?.enabled !== false
        const colorList = shouldUseBrandColors
            ? [colors?.primary, colors?.secondary, colors?.accent].filter((value): value is string => typeof value === "string" && value.length > 0)
            : []
        const colorContext = colorList.length > 0 ? ` Use these brand colors: ${colorList.join(", ")}.` : ""
        const promptUsed = String(lastMsg?.content || prompt || "Generate an image")
        const enhancedPrompt = `${promptUsed}. Style: ${style || "Photorealistic, cinematic lighting"}.${colorContext}`

        let generationResult: { imageUrl: string; usedModel: string }
        if (aiConfig.provider === "openrouter") {
            generationResult = await generateWithOpenRouterImage({
                apiKey: aiConfig.apiKey,
                modelName: aiConfig.modelName,
                prompt: enhancedPrompt,
                referenceImages,
                referenceMode,
                brandImageMode,
                transformAction,
            })
        } else if (aiConfig.provider === "openai") {
            generationResult = await generateWithOpenAIImage({
                apiKey: aiConfig.apiKey,
                modelName: aiConfig.modelName,
                prompt: enhancedPrompt,
            })
        } else {
            generationResult = await generateWithGeminiImage({
                primaryKey,
                fallbackKey,
                modelName: aiConfig.modelName,
                prompt: enhancedPrompt,
                referenceImages,
                referenceMode,
                brandImageMode,
                transformAction,
            })
        }

        let finalAssetUrl = generationResult.imageUrl

        if (generationResult.imageUrl.startsWith("data:")) {
            try {
                const blob = await (await fetch(generationResult.imageUrl)).blob()
                const fileName = `generated/${workspaceId}/${Date.now()}.png`
                const { error: uploadError } = await supabase.storage.from("generated_assets").upload(fileName, blob, {
                    contentType: "image/png",
                    upsert: true,
                })

                if (!uploadError) {
                    const { data: publicData } = supabase.storage.from("generated_assets").getPublicUrl(fileName)
                    finalAssetUrl = publicData.publicUrl
                } else {
                    console.error("Upload Error:", redactSensitiveLogValue(uploadError))
                }
            } catch (error) {
                console.error("Blob conversion error:", redactSensitiveLogValue(error))
            }
        }

        const { error: insertError } = await supabase.from("generated_assets").insert({
            workspace_id: workspaceId,
            asset_type: "image",
            image_url: finalAssetUrl,
            content: { prompt: promptUsed, model: generationResult.usedModel, style },
        })

        if (insertError) {
            console.error("Database insert error:", redactSensitiveLogValue(insertError))
        } else {
            console.log("Successfully saved to generated_assets")
        }

        await attachGeneratedImageToAutomationDraft({
            supabase,
            workspaceId,
            attachContext,
            imageUrl: finalAssetUrl,
        })

        return new Response(
            JSON.stringify({
                result: {
                    type: "image",
                    prompt_used: promptUsed,
                    id: `img_${Date.now()}`,
                    imageUrl: finalAssetUrl,
                    model: generationResult.usedModel,
                },
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            },
        )
    } catch (error: unknown) {
        console.error("[generate-image] fatal error:", redactSensitiveLogValue(error))
        if (supabase) {
            await markAutomationImageFailure({
                supabase,
                attachContext,
                message: toUserFriendlyError(error),
            })
        }
        return new Response(
            JSON.stringify({ error: toUserFriendlyError(error) }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            },
        )
    }
})
