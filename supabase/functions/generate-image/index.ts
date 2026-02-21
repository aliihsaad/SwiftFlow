import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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
        const { messages, workspaceId, prompt, style } = await req.json()
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

        const rows = (settingsRows || []).map((row: any) => ({
            ...row,
            normalizedKey: normalizeApiKey(row?.gemini_api_key),
        }))
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
                            parts: [{ text: enhancedPrompt }]
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
