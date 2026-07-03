import { NextRequest, NextResponse } from 'next/server'
import { getExplicitActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { assertJsonBodySize, assertUuid } from '@/lib/security/phase1-validation'
import { createClient } from '@/utils/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected error'
}

export async function POST(
    request: NextRequest,
    { params }: RouteContext,
) {
    try {
        const { id } = await params
        const automationId = assertUuid(id, 'automation id')
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const activeWorkspace = await getExplicitActiveWorkspace()
        if (!activeWorkspace) return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'automation:write')

        assertJsonBodySize(request, 64 * 1024)
        const body = await request.json()
        const isActive = typeof body?.is_active === 'boolean' ? body.is_active : null
        if (isActive == null) {
            return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 400 })
        }

        const { data: existing, error: existingError } = await supabase
            .from('publishing_automations')
            .select('id, approval_mode')
            .eq('id', automationId)
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        if (existingError) throw existingError
        if (!existing) return NextResponse.json({ error: 'Publishing automation not found' }, { status: 404 })

        const approvalMode = typeof existing.approval_mode === 'string' ? existing.approval_mode : 'manual_review'

        if (isActive && approvalMode !== 'manual_review') {
            return NextResponse.json({
                error: 'The auto_schedule and auto_publish approval modes are not yet supported. Switch this automation to manual_review before starting it.',
                errorCode: 'approval_mode_not_supported',
            }, { status: 400 })
        }

        const { data: automation, error } = await supabase
            .from('publishing_automations')
            .update({
                is_active: isActive,
                next_run_at: isActive ? new Date().toISOString() : null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', automationId)
            .eq('workspace_id', activeWorkspace.id)
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ success: true, automation })
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid automation id|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) return NextResponse.json({ error: errorMessage(error) }, { status: permissionStatus })
        console.error('Toggle publishing automation API error:', error)
        return NextResponse.json({ error: errorMessage(error) || 'Failed to toggle publishing automation' }, { status: 500 })
    }
}
