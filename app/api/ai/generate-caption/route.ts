import { NextRequest, NextResponse } from 'next/server'
import { AICaptionRequest, AICaptionResponse } from '@/types/post'
import { createClient } from '@/utils/supabase/server'
import { assertJsonBodySize, sanitizeAICaptionPayload } from '@/lib/security/phase1-validation'
import { enforceRateLimit, getClientIp, RateLimitExceededError } from '@/lib/security/rate-limit'
import { gateAiGeneration } from '@/lib/billing/gate'
import { incrementWorkspaceUsage } from '@/lib/billing/usage'
import { createAdminClient } from '@/utils/supabase/admin'
import { buildSupabaseFunctionHeaders, getSupabaseServiceRoleKey } from '@/lib/supabase/service-key'

export const runtime = 'edge'


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

        // AI generation writes cost money; require an explicit, membership-verified
        // workspace selection and never fall back to the user's first workspace.
        const requestedWorkspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null
        const cookieWorkspaceId = request.cookies.get('active_workspace_id')?.value || null
        const effectiveWorkspaceId = requestedWorkspaceId || cookieWorkspaceId

        if (!effectiveWorkspaceId) {
            return NextResponse.json(
                { error: 'No valid workspace selected' },
                { status: 400 }
            )
        }

        const { data: membership } = await supabase
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .eq('workspace_id', effectiveWorkspaceId)
            .maybeSingle()

        if (!membership) {
            return NextResponse.json(
                { error: 'No access to the selected workspace' },
                { status: 403 }
            )
        }

        const clientIp = getClientIp(request)
        await enforceRateLimit(
            { scope: 'ai:caption:user', subject: `${user.id}:${effectiveWorkspaceId}`, limit: 30, windowSeconds: 15 * 60 },
            'Too many caption requests. Please wait a moment and try again.'
        )
        await enforceRateLimit(
            { scope: 'ai:caption:ip', subject: clientIp, limit: 60, windowSeconds: 15 * 60 },
            'Too many caption requests. Please wait a moment and try again.'
        )

        // Plan quota gate; BYOK workspaces (own AI key) are exempt.
        const quotaGate = await gateAiGeneration(effectiveWorkspaceId)
        if (quotaGate) return quotaGate

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const serviceKey = getSupabaseServiceRoleKey()

        if (!supabaseUrl || !serviceKey) {
            throw new Error('Server config missing Supabase URL or service key')
        }

        const headers = buildSupabaseFunctionHeaders(serviceKey)

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

        await incrementWorkspaceUsage(createAdminClient(), effectiveWorkspaceId, 'ai_generations')
        return NextResponse.json(payload as AICaptionResponse)

    } catch (error: unknown) {
        if (error instanceof RateLimitExceededError) {
            return NextResponse.json(
                { error: error.message },
                { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } }
            )
        }
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
