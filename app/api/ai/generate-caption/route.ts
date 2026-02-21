import { NextRequest, NextResponse } from 'next/server'
import { AICaptionRequest, AICaptionResponse } from '@/types/post'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'edge'

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
        const { data, error } = await supabase.functions.invoke('generate-caption', {
            body: { description, platforms, tone, language, workspaceId: effectiveWorkspaceId }
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
