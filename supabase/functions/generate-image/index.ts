import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { messages, workspaceId, prompt, style } = await req.json()
        const lastMsg = messages ? messages[messages.length - 1] : { content: prompt || "Generate an image" }

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        const { data: settings } = await supabase.from('workspace_settings').select('*').eq('workspace_id', workspaceId).maybeSingle()

        const apiKey = settings?.gemini_api_key || Deno.env.get('GEMINI_API_KEY')!

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

        // User explicitly requested gemini-3-pro-image-preview for high-fidelity image generation
        const targetModel = 'gemini-3-pro-image-preview'

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`

        const enhancedPrompt = `${lastMsg.content}. Style: ${style || 'Photorealistic, cinematic lighting'}.${colorContext}`

        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: enhancedPrompt }]
                }],
                // REST API uses generationConfig, SDK uses config
                generationConfig: {
                    imageConfig: {
                        aspectRatio: "1:1",
                        imageSize: "1K"
                    }
                }
            })
        })

        if (!response.ok) {
            const errText = await response.text()
            throw new Error(`Gemini API Error: ${response.status} ${errText}`)
        }

        const data = await response.json()

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
            content: { prompt: promptUsed, model: targetModel, style: style }
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
            imageUrl: finalAssetUrl
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
