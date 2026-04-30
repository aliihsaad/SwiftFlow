import { NextRequest, NextResponse } from 'next/server'
import { getActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { assertUuid } from '@/lib/security/phase1-validation'
import { createClient } from '@/utils/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected error'
}

function parseLimit(request: NextRequest): number {
    const raw = request.nextUrl.searchParams.get('limit')
    const parsed = raw ? Number(raw) : 50
    if (!Number.isInteger(parsed)) return 50
    return Math.min(100, Math.max(1, parsed))
}

export async function GET(
    request: NextRequest,
    { params }: RouteContext,
) {
    try {
        const { id } = await params
        const automationId = assertUuid(id, 'automation id')
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'workspace:read')

        const { data: existing, error: existingError } = await supabase
            .from('publishing_automations')
            .select('id')
            .eq('id', automationId)
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        if (existingError) throw existingError
        if (!existing) return NextResponse.json({ error: 'Publishing automation not found' }, { status: 404 })

        const { data: runs, error } = await supabase
            .from('publishing_automation_runs')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('publishing_automation_id', automationId)
            .order('created_at', { ascending: false })
            .limit(parseLimit(request))

        if (error) throw error

        return NextResponse.json({ runs: runs || [] })
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid automation id/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) return NextResponse.json({ error: errorMessage(error) }, { status: permissionStatus })
        console.error('List publishing automation runs API error:', error)
        return NextResponse.json({ error: errorMessage(error) || 'Failed to fetch publishing automation runs' }, { status: 500 })
    }
}
