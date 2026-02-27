import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decryptSecretIfNeeded } from "../_shared/secret-crypto.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizeApiKey(value: unknown): string {
    return String(value || '').trim().replace(/^['"]|['"]$/g, '')
}

function getGoogleErrorInfo(payload: any): { reason: string; message: string } {
    const details = Array.isArray(payload?.error?.details) ? payload.error.details : []
    const reason = details.find((d: any) => typeof d?.reason === 'string')?.reason || payload?.error?.status || 'UNKNOWN'
    const message = String(payload?.error?.message || '')
    return { reason, message }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { messages, workspaceId, prompt, style, referenceImages, referenceMode, brandImageMode, transformAction } = await req.json()
        const lastMsg = messages ? messages[messages.length - 1] : { content: prompt || "Generate an image" }

        if (!workspaceId) {
            throw new Error('workspaceId is required for image generation.')
        }

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        const { data: settingsRows, error: settingsError } = await supabase
            .from('workspace_settings')
            .select('workspace_id, gemini_api_key, updated_at')
            .eq('workspace_id', workspaceId)
            .order('updated_at', { ascending: false })
            .limit(20)

        if (settingsError) {
            console.error('workspace_settings lookup failed:', settingsError)
        }

        const rows = await Promise.all((settingsRows || []).map(async (row: any) => ({
            ...row,
            normalizedKey: normalizeApiKey(await decryptSecretIfNeeded(row?.gemini_api_key)),
        })))
        const hasWorkspaceSettings = rows.length > 0
        const latestRow = rows[0] || null
        const rowWithKey = rows.find((row: any) => !!row.normalizedKey) || null
        const effectiveSettingsRow = rowWithKey || latestRow
        const dbKey = normalizeApiKey(effectiveSettingsRow?.normalizedKey)
        const envKey = normalizeApiKey(Deno.env.get('GEMINI_API_KEY'))
        let primaryKey = ''
        let fallbackKey: string | null = null
        let keySource = ''

        if (dbKey) {
            primaryKey = dbKey
            keySource = 'workspace_settings'
            fallbackKey = envKey && envKey !== dbKey ? envKey : null
        } else if (!hasWorkspaceSettings && envKey) {
            primaryKey = envKey
            keySource = 'edge_secret'
        } else if (hasWorkspaceSettings) {
            throw new Error(`Gemini API key is not configured for this workspace (${workspaceId}). Update Settings > AI Provider.`)
        }

        if (!primaryKey) {
            throw new Error('Gemini API key is missing. Add a valid key in Settings > AI Provider.')
        }
        if (!primaryKey.startsWith('AIza')) {
            throw new Error('Gemini API key format looks invalid. Please paste a valid Google AI Studio key.')
        }

        // Fetch brand profile for color context
        const { data: brandProfile } = await supabase
            .from('workspace_brand_profiles')
            .select('brand_colors, business_name')
            .eq('workspace_id', workspaceId)
            .maybeSingle()

        // Build color context for the prompt
        let colorContext = ''
        if (brandProfile?.brand_colors) {
            const colors = brandProfile.brand_colors
            const colorList = []
            if (colors.primary) colorList.push(`primary: ${colors.primary}`)
            if (colors.secondary) colorList.push(`secondary: ${colors.secondary}`)
            if (colors.accent) colorList.push(`accent: ${colors.accent}`)

            if (colorList.length > 0) {
                colorContext = ` Use these brand colors: ${colorList.join(', ')}.`
            }
        }

        const enhancedPrompt = `${lastMsg.content}. Style: ${style || 'Photorealistic, cinematic lighting'}.${colorContext}`
        const modelCandidates = [
            'gemini-2.5-flash-image',
            'gemini-3-pro-image-preview',
            'gemini-2.0-flash-preview-image-generation',
        ]

        // Build multimodal content parts for Gemini
        function buildContentParts(
            textPrompt: string,
            refImages?: { base64: string; mimeType: string }[],
            refMode?: string,
            imgMode?: string,
            txAction?: string,
        ): any[] {
            const parts: any[] = []

            // Add reference images as inline data if provided
            if (Array.isArray(refImages) && refImages.length > 0) {
                for (const img of refImages) {
                    parts.push({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: img.base64 } })
                }

                // Add contextual instruction based on mode
                let refInstruction = ''
                if (imgMode === 'transform' && txAction) {
                    const transformInstructions: Record<string, string> = {
                        'restyle': 'Restyle the uploaded image(s) while keeping the subject and composition. Apply the described style.',
                        'add-brand-colors': 'Modify the uploaded image(s) to incorporate the brand colors while maintaining the original composition.',
                        'modernize': 'Modernize the uploaded image(s) with a contemporary, clean aesthetic while preserving the core subject.',
                        'simplify': 'Simplify the uploaded image(s) by reducing visual complexity while keeping the key elements recognizable.',
                    }
                    refInstruction = transformInstructions[txAction] || 'Transform the uploaded image(s) as described.'
                } else if (refMode) {
                    const refInstructions: Record<string, string> = {
                        'match-style': 'Generate a new image that matches the visual style, textures, and artistic approach of the reference images.',
                        'match-colors': 'Generate a new image using the color palette from the reference images.',
                        'use-as-template': 'Generate a new image using the reference images as compositional templates for layout and structure.',
                        'inspired-by': 'Generate a new image inspired by the mood, feel, and aesthetic of the reference images.',
                    }
                    refInstruction = refInstructions[refMode] || 'Use the reference images as guidance for the new image.'
                }

                parts.push({ text: `${refInstruction} ${textPrompt}` })
            } else {
                parts.push({ text: textPrompt })
            }

            return parts
        }

        let data: any = null
        let usedModel = ''
        let lastError = ''
        const tried = new Set<string>()

        const executeWithKey = async (apiKey: string) => {
            for (const candidate of modelCandidates) {
                if (tried.has(`${candidate}:${apiKey}`)) continue
                tried.add(`${candidate}:${apiKey}`)

                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${apiKey}`
                const response = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: buildContentParts(enhancedPrompt, referenceImages, referenceMode, brandImageMode, transformAction)
                        }],
                        generationConfig: {
                            imageConfig: {
                                aspectRatio: "1:1",
                                imageSize: "1K"
                            }
                        }
                    })
                })

                const rawText = await response.text()
                let parsed: any = null
                try {
                    parsed = rawText ? JSON.parse(rawText) : null
                } catch {
                    parsed = null
                }

                if (response.ok) {
                    data = parsed
                    usedModel = candidate
                    return true
                }

                const info = getGoogleErrorInfo(parsed)
                lastError = `Gemini API Error (${response.status}) [${info.reason}] ${info.message || rawText}`

                // Try next model on model capability / availability errors.
                if (/NOT_FOUND|MODEL_NOT_FOUND|FAILED_PRECONDITION|UNIMPLEMENTED|unsupported/i.test(info.reason + ' ' + info.message)) {
                    continue
                }

                // If key invalid, caller may retry with fallback key.
                if (/API_KEY_INVALID|PERMISSION_DENIED|INVALID_ARGUMENT/i.test(info.reason + ' ' + info.message)) {
                    return false
                }

                // Unknown non-model error, stop trying this key.
                return false
            }
            return false
        }

        let success = await executeWithKey(primaryKey)
        if (!success && fallbackKey) {
            success = await executeWithKey(fallbackKey)
        }

        if (!success || !data) {
            throw new Error(
                `${lastError || 'Gemini image generation failed.'} (keySource=${keySource}${fallbackKey ? ', fallback=env' : ''})`
            )
        }

        // Debug Log
        console.log('Gemini Response:', JSON.stringify(data).substring(0, 500))

        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            const reason = data.promptFeedback?.blockReason || 'UNKNOWN'
            throw new Error(`Gemini Refused. Reason: ${reason}`)
        }

        let imageUrl = ""
        let promptUsed = lastMsg.content

        // Parse Inline Data (as per user-provided implementation)
        for (const part of data.candidates[0].content.parts) {
            if (part.inlineData) {
                imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
                break
            }
        }

        if (!imageUrl) {
            const textPart = data.candidates[0].content.parts.find((p: any) => p.text)
            if (textPart) {
                throw new Error(`Model returned text instead of image: "${textPart.text}"`)
            }
            throw new Error('No image data found in response.')
        }

        // --- Persistence Logic ---
        let finalAssetUrl = imageUrl

        // Upload to Supabase Storage
        if (imageUrl.startsWith('data:')) {
            try {
                const blob = await (await fetch(imageUrl)).blob()
                const fileName = `generated/${workspaceId}/${Date.now()}.png`
                const { error: uploadError } = await supabase.storage.from('generated_assets').upload(fileName, blob, {
                    contentType: 'image/png',
                    upsert: true
                })
                if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage.from('generated_assets').getPublicUrl(fileName)
                    finalAssetUrl = publicUrl
                } else {
                    console.error("Upload Error:", uploadError)
                }
            } catch (e) {
                console.error("Blob conversion error:", e)
            }
        }

        // Insert into generated_assets
        const { error: insertError } = await supabase.from('generated_assets').insert({
            workspace_id: workspaceId,
            asset_type: 'image',
            image_url: finalAssetUrl,
            content: { prompt: promptUsed, model: usedModel, style: style }
        })

        if (insertError) {
            console.error("Database insert error:", insertError)
        } else {
            console.log("Successfully saved to generated_assets")
        }

        const parsedResult = {
            type: "image",
            prompt_used: promptUsed,
            id: `img_${Date.now()}`,
            imageUrl: finalAssetUrl,
            model: usedModel,
        }

        return new Response(JSON.stringify({ result: parsedResult }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
