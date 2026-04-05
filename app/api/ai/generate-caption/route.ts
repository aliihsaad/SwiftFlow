import { NextRequest, NextResponse } from 'next/server'
import { AICaptionRequest, AICaptionResponse } from '@/types/post'
import { createClient } from '@/utils/supabase/server'
import { assertJsonBodySize, sanitizeAICaptionPayload } from '@/lib/security/phase1-validation'

export const runtime = 'edge'

function looksLikeJwt(value: string | null | undefined): boolean {
    const normalized = String(value || '').trim()
    return normalized.startsWith('eyJ') && normalized.split('.').length === 3
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        assertJsonBodySize(request, 128 * 1024)
        const body = sanitizeAICaptionPayload(await request.json() as (AICaptionRequest & { workspaceId?: string }))
        const { description, platforms, tone, language } = body

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const requestedWorkspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null
        const cookieWorkspaceId = request.cookies.get('active_workspace_id')?.value || null
        let effectiveWorkspaceId = requestedWorkspaceId || cookieWorkspaceId

        if (effectiveWorkspaceId) {
            const { data: membership } = await supabase
                .from('workspace_members')
                .select('workspace_id')
                .eq('user_id', user.id)
                .eq('workspace_id', effectiveWorkspaceId)
                .maybeSingle()

            if (!membership) {
                effectiveWorkspaceId = null
            }
        }

        if (!effectiveWorkspaceId) {
            const { data: firstMembership } = await supabase
                .from('workspace_members')
                .select('workspace_id')
                .eq('user_id', user.id)
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle()

            effectiveWorkspaceId = firstMembership?.workspace_id || null
        }

        if (!effectiveWorkspaceId) {
            return NextResponse.json(
                { error: 'No active workspace found for caption generation' },
                { status: 400 }
            )
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null

        if (!supabaseUrl || !serviceKey) {
            throw new Error('Server config missing Supabase URL or service key')
        }

        const authJwt = looksLikeJwt(serviceKey)
            ? serviceKey
            : (looksLikeJwt(anonKey) ? anonKey : null)
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            apikey: serviceKey,
        }

        if (authJwt) {
            headers.Authorization = `Bearer ${authJwt}`
        }

        const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ description, platforms, tone, language, workspaceId: effectiveWorkspaceId }),
        })

        const rawText = await edgeResponse.text()
        let payload: (AICaptionResponse & { error?: string }) | null = null
        try {
            payload = rawText ? JSON.parse(rawText) as AICaptionResponse & { error?: string } : null
        } catch {
            payload = null
        }

        if (!edgeResponse.ok) {
            const details = payload?.error || rawText || 'Failed to invoke AI function'
            console.error('Edge Function Error:', edgeResponse.status, details)
            throw new Error(details)
        }

        return NextResponse.json(payload as AICaptionResponse)

    } catch (error: unknown) {
        if (error instanceof Error && /Invalid AI caption request|Description is required|At least one valid platform is required|Invalid workspaceId|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json(
                { error: error.message },
                { status: 400 }
            )
        }
        console.error('AI Caption Generation Error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to generate captions' },
            { status: 500 }
        )
    }
}
