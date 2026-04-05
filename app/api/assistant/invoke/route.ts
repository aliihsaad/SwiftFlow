import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { assertJsonBodySize, sanitizeAssistantInvokePayload } from '@/lib/security/phase1-validation'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const ALLOWED_FUNCTIONS = new Set([
    'chat-assistant',
    'generate-image',
    'generate-ideas',
    'generate-carousel',
    'generate-reply',
    'generate-message-reply',
])

type AllowedFunctionName =
    | 'chat-assistant'
    | 'generate-image'
    | 'generate-ideas'
    | 'generate-carousel'
    | 'generate-reply'
    | 'generate-message-reply'

function looksLikeJwt(value: string | null | undefined): boolean {
    const normalized = String(value || '').trim()
    return normalized.startsWith('eyJ') && normalized.split('.').length === 3
}

export async function POST(request: NextRequest) {
    try {
        assertJsonBodySize(request)
        const payload = await request.json()
        const functionName = typeof payload?.functionName === 'string' ? payload.functionName : ''
        const body = payload?.body

        if (!functionName) {
            return NextResponse.json({ error: 'functionName is required' }, { status: 400 })
        }

        if (!ALLOWED_FUNCTIONS.has(functionName)) {
            return NextResponse.json({ error: `Function "${functionName}" is not allowed` }, { status: 400 })
        }

        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Resolve workspace server-side so assistant calls always target the correct workspace.
        const requestedWorkspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : null
        const cookieWorkspaceId = request.cookies.get('active_workspace_id')?.value || null
        const supabaseAdmin = createAdminClient()
        const { data: memberships, error: membershipsError } = await supabaseAdmin
            .from('workspace_members')
            .select('workspace_id, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })

        if (membershipsError) {
            return NextResponse.json(
                { error: `Failed to resolve workspace membership: ${membershipsError.message}` },
                { status: 500 }
            )
        }

        if (!memberships || memberships.length === 0) {
            return NextResponse.json({ error: 'No workspace memberships found for this account' }, { status: 403 })
        }

        const allowedWorkspaceIds = new Set(memberships.map(m => m.workspace_id))
        const preferredWorkspaceId = [requestedWorkspaceId, cookieWorkspaceId].find(
            (id): id is string => !!id && allowedWorkspaceIds.has(id)
        )
        const effectiveWorkspaceId = preferredWorkspaceId || memberships[0].workspace_id

        const invokeBody = {
            ...sanitizeAssistantInvokePayload(functionName as AllowedFunctionName, body || {}),
            workspaceId: effectiveWorkspaceId,
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null

        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json(
                { error: 'Server config missing Supabase URL or service key' },
                { status: 500 }
            )
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

        const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(invokeBody)
        })

        const rawText = await edgeResponse.text()
        let parsed: { error?: string } | null = null
        try {
            parsed = rawText ? JSON.parse(rawText) : null
        } catch {
            parsed = null
        }

        if (!edgeResponse.ok) {
            const details = parsed?.error || rawText || `Edge function ${functionName} failed`
            console.error(`[assistant/invoke] ${functionName} non-2xx:`, edgeResponse.status, details)
            return NextResponse.json(
                { error: details },
                { status: edgeResponse.status >= 400 ? edgeResponse.status : 502 }
            )
        }

        return NextResponse.json({ data: parsed }, { status: 200 })
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid assistant payload|Invalid workspaceId|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json(
                { error: error.message },
                { status: 400 }
            )
        }
        console.error('[assistant/invoke] unexpected error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        )
    }
}
