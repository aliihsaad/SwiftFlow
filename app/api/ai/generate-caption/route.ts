import { NextRequest, NextResponse } from 'next/server'
import { AICaptionRequest, AICaptionResponse } from '@/types/post'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const body = await request.json() as AICaptionRequest
        const { description, platforms, tone, language } = body

        if (!description) {
            return NextResponse.json(
                { error: 'Description is required' },
                { status: 400 }
            )
        }

        // Invoke Supabase Edge Function
        const { data, error } = await supabase.functions.invoke('generate-caption', {
            body: { description, platforms, tone, language }
        })

        if (error) {
            console.error('Edge Function Error:', error)
            throw new Error(error.message || 'Failed to invoke AI function')
        }

        return NextResponse.json(data as AICaptionResponse)

    } catch (error: any) {
        console.error('AI Caption Generation Error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to generate captions' },
            { status: 500 }
        )
    }
}
