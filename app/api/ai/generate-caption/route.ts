import { NextRequest, NextResponse } from 'next/server'
import { FunctionsHttpError } from '@supabase/functions-js'
import { AICaptionRequest, AICaptionResponse } from '@/types/post'
import { createClient } from '@/utils/supabase/server'
import { invokeWithSessionRetry } from '@/utils/supabase/invoke-with-session-retry'

export const runtime = 'edge'

async function getFunctionErrorMessage(error: unknown): Promise<string> {
    if (!(error instanceof FunctionsHttpError)) {
        return error instanceof Error ? error.message : 'Failed to invoke AI function'
    }

    try {
        const response = error.context
        const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null
        return payload?.error || payload?.message || error.message || 'Failed to invoke AI function'
    } catch {
        return error.message || 'Failed to invoke AI function'
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const body = await request.json() as (AICaptionRequest & { workspaceId?: string })
        const { description, platforms, tone, language } = body

        if (!description) {
            return NextResponse.json(
                { error: 'Description is required' },
                { status: 400 }
            )
        }

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

        // Invoke Supabase Edge Function
        const { data, error } = await invokeWithSessionRetry<AICaptionResponse>(supabase, 'generate-caption', {
            body: { description, platforms, tone, language, workspaceId: effectiveWorkspaceId }
        })

        if (error) {
            console.error('Edge Function Error:', error)
            throw new Error(await getFunctionErrorMessage(error))
        }

        return NextResponse.json(data as AICaptionResponse)

    } catch (error: unknown) {
        console.error('AI Caption Generation Error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to generate captions' },
            { status: 500 }
        )
    }
}
