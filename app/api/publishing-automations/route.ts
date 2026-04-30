import { NextRequest, NextResponse } from 'next/server'
import { getActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { checkPublishingAutomationReadiness } from '@/lib/publishing-automation-readiness'
import { sanitizeCreatePublishingAutomationPayload } from '@/lib/publishing-automation-validation'
import { assertJsonBodySize } from '@/lib/security/phase1-validation'
import { createClient } from '@/utils/supabase/server'

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected error'
}

export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'workspace:read')

        const { data, error } = await supabase
            .from('publishing_automations')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .order('created_at', { ascending: false })

        if (error) throw error

        return NextResponse.json({ automations: data || [] })
    } catch (error: unknown) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) return NextResponse.json({ error: errorMessage(error) }, { status: permissionStatus })
        console.error('List publishing automations API error:', error)
        return NextResponse.json({ error: errorMessage(error) || 'Failed to fetch publishing automations' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'automation:write')

        assertJsonBodySize(request, 256 * 1024)
        const payload = sanitizeCreatePublishingAutomationPayload(await request.json())

        const readiness = await checkPublishingAutomationReadiness(supabase, activeWorkspace.id, payload.platforms)
        if (!readiness.ready && payload.approval_mode !== 'manual_review') {
            return NextResponse.json({
                error: 'Selected platforms are not ready for automated publishing',
                errorCode: 'meta_missing_permission',
                missingPlatforms: readiness.missingPlatforms,
                missingPermissions: readiness.missingPermissions,
                requiresReconnect: true,
            }, { status: 403 })
        }

        const { data: automation, error } = await supabase
            .from('publishing_automations')
            .insert({
                workspace_id: activeWorkspace.id,
                created_by: user.id,
                name: payload.name,
                is_active: false,
                platforms: payload.platforms,
                approval_mode: payload.approval_mode,
                content_goal: payload.content_goal,
                brand_voice: payload.brand_voice || null,
                content_pillars: payload.content_pillars || [],
                excluded_terms: payload.excluded_terms || [],
                cta_config: payload.cta_config || {},
                media_policy: payload.media_policy || {},
                workflow_config: payload.workflow_config,
                consistency_config: payload.consistency_config || {},
                schedule_config: payload.schedule_config,
                daily_cap: payload.daily_cap || 1,
            })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ success: true, automation })
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid publishing automation payload|Automation name is required|Content goal is required|At least one valid platform|Workflow platform mode|Workflow approval mode|Scheduled automation|Instagram scheduled automation|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) return NextResponse.json({ error: errorMessage(error) }, { status: permissionStatus })
        console.error('Create publishing automation API error:', error)
        return NextResponse.json({ error: errorMessage(error) || 'Failed to create publishing automation' }, { status: 500 })
    }
}
