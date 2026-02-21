import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

const ALLOWED_FUNCTIONS = new Set([
    'chat-assistant',
    'generate-image',
    'generate-ideas',
    'generate-carousel',
    'search-unsplash',
    'select-unsplash-image',
])

export async function POST(request: NextRequest) {
    try {
        const { functionName, body } = await request.json()

        if (!functionName || typeof functionName !== 'string') {
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

        const invokeBody = { ...(body || {}), workspaceId: effectiveWorkspaceId }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json(
                { error: 'Server config missing Supabase URL or service key' },
                { status: 500 }
            )
        }

        const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify(invokeBody)
        })

        const rawText = await edgeResponse.text()
        let parsed: any = null
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
    } catch (error: any) {
        console.error('[assistant/invoke] unexpected error:', error)
        return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
    }
}
