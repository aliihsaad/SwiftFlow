import { NextRequest, NextResponse } from 'next/server'
import type { Platform } from '@/types/post'
import { checkPublishingAutomationReadiness } from '@/lib/publishing-automation-readiness'
import { getActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { assertJsonBodySize, assertUuid } from '@/lib/security/phase1-validation'
import { createClient } from '@/utils/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected error'
}

function platformsFromRow(value: unknown): Platform[] {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is Platform => item === 'facebook' || item === 'instagram')
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

        const activeWorkspace = await getActiveWorkspace()
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
            .select('id, platforms, approval_mode')
            .eq('id', automationId)
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        if (existingError) throw existingError
        if (!existing) return NextResponse.json({ error: 'Publishing automation not found' }, { status: 404 })

        const platforms = platformsFromRow(existing.platforms)
        const approvalMode = typeof existing.approval_mode === 'string' ? existing.approval_mode : 'manual_review'

        if (isActive && approvalMode !== 'manual_review') {
            const readiness = await checkPublishingAutomationReadiness(supabase, activeWorkspace.id, platforms)
            if (!readiness.ready) {
                return NextResponse.json({
                    error: 'Selected platforms are not ready for automated publishing',
                    errorCode: 'meta_missing_permission',
                    missingPlatforms: readiness.missingPlatforms,
                    missingPermissions: readiness.missingPermissions,
                    requiresReconnect: true,
                }, { status: 403 })
            }
        }

        const { data: automation, error } = await supabase
            .from('publishing_automations')
            .update({
                is_active: isActive,
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
