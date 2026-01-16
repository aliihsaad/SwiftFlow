import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { query, count = 12, orientation = 'landscape', workspaceId } = await req.json()

        if (!query || !query.trim()) {
            throw new Error('Search query is required')
        }

        const unsplashAccessKey = Deno.env.get('UNSPLASH_ACCESS_KEY')
        if (!unsplashAccessKey) {
            throw new Error('Unsplash API key not configured')
        }

        // Search Unsplash API
        const searchUrl = new URL('https://api.unsplash.com/search/photos')
        searchUrl.searchParams.append('query', query)
        searchUrl.searchParams.append('per_page', count.toString())
        if (orientation && orientation !== 'any') {
            searchUrl.searchParams.append('orientation', orientation)
        }

        const response = await fetch(searchUrl.toString(), {
            headers: {
                'Authorization': `Client-ID ${unsplashAccessKey}`,
                'Accept-Version': 'v1'
            }
        })

        console.log('Unsplash API Response Status:', response.status)

        if (!response.ok) {
            const errorText = await response.text()
            console.error('Unsplash API Error Details:', errorText)
            throw new Error(`Unsplash API Error: ${response.status} ${errorText}`)
        }

        const data = await response.json()
        console.log('Unsplash API Success - Found:', data.total, 'results')

        // Format results for frontend
        const results = data.results.map((photo: any) => ({
            id: photo.id,
            url: photo.urls.regular,
            thumb: photo.urls.thumb,
            fullUrl: photo.urls.full,
            width: photo.width,
            height: photo.height,
            description: photo.description || photo.alt_description,
            photographer: {
                name: photo.user.name,
                username: photo.user.username,
                profileUrl: photo.user.links.html,
                portfolioUrl: photo.user.portfolio_url
            },
            downloadLink: photo.links.download_location,
            color: photo.color
        }))

        return new Response(JSON.stringify({
            result: {
                type: 'unsplash_results',
                data: results,
                total: data.total,
                query: query
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('Unsplash search error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
