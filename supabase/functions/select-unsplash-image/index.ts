import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { unsplashId, downloadLocation, workspaceId, photographer } = await req.json()

        if (!unsplashId || !downloadLocation) {
            throw new Error('Missing required parameters')
        }

        const unsplashAccessKey = Deno.env.get('UNSPLASH_ACCESS_KEY')
        if (!unsplashAccessKey) {
            throw new Error('Unsplash API key not configured')
        }

        // Trigger download tracking (required by Unsplash API guidelines)
        const trackResponse = await fetch(downloadLocation, {
            headers: {
                'Authorization': `Client-ID ${unsplashAccessKey}`
            }
        })

        if (!trackResponse.ok) {
            console.error('Failed to track download:', await trackResponse.text())
        }

        // Get the full photo details
        const photoResponse = await fetch(`https://api.unsplash.com/photos/${unsplashId}`, {
            headers: {
                'Authorization': `Client-ID ${unsplashAccessKey}`,
                'Accept-Version': 'v1'
            }
        })

        if (!photoResponse.ok) {
            throw new Error(`Failed to fetch photo: ${photoResponse.status}`)
        }

        const photo = await photoResponse.json()
        const imageUrl = photo.urls.regular

        // Save to database
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const { data: asset, error: insertError } = await supabase
            .from('generated_assets')
            .insert({
                workspace_id: workspaceId,
                asset_type: 'image',
                source: 'unsplash',
                image_url: imageUrl,
                unsplash_id: unsplashId,
                attribution: {
                    photographer: photographer.name,
                    username: photographer.username,
                    profileUrl: photographer.profileUrl,
                    portfolioUrl: photographer.portfolioUrl
                },
                content: {
                    description: photo.description || photo.alt_description,
                    color: photo.color,
                    width: photo.width,
                    height: photo.height
                }
            })
            .select()
            .single()

        if (insertError) {
            console.error('Database insert error:', insertError)
        }

        return new Response(JSON.stringify({
            result: {
                type: 'image',
                id: `unsplash_${unsplashId}`,
                imageUrl: imageUrl,
                source: 'unsplash',
                attribution: photographer
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('Select Unsplash image error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
