import { NextRequest, NextResponse } from 'next/server'
import type { CreatePublishingAutomationPayload } from '@/types/publishing-automation'
import { checkPublishingAutomationReadiness } from '@/lib/publishing-automation-readiness'
import {
    sanitizeCreatePublishingAutomationPayload,
    sanitizeMergedPublishingAutomationPayload,
    sanitizeUpdatePublishingAutomationPayload,
} from '@/lib/publishing-automation-validation'
import { getActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { assertJsonBodySize, assertUuid } from '@/lib/security/phase1-validation'
import { createClient } from '@/utils/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }
type AutomationRow = Record<string, unknown>

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected error'
}

function rowToPayload(row: AutomationRow): CreatePublishingAutomationPayload {
    return sanitizeCreatePublishingAutomationPayload({
        name: row.name,
        platforms: row.platforms,
        approval_mode: row.approval_mode,
        content_goal: row.content_goal,
        brand_voice: row.brand_voice,
        content_pillars: row.content_pillars,
        excluded_terms: row.excluded_terms,
        cta_config: row.cta_config,
        media_policy: row.media_policy,
        consistency_config: row.consistency_config,
        workflow_config: row.workflow_config,
        schedule_config: row.schedule_config,
        daily_cap: row.daily_cap,
    })
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

        const { data: automation, error } = await supabase
            .from('publishing_automations')
            .select('*')
            .eq('id', automationId)
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        if (error) throw error
        if (!automation) return NextResponse.json({ error: 'Publishing automation not found' }, { status: 404 })

        return NextResponse.json({ automation })
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid automation id/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) return NextResponse.json({ error: errorMessage(error) }, { status: permissionStatus })
        console.error('Get publishing automation API error:', error)
        return NextResponse.json({ error: errorMessage(error) || 'Failed to fetch publishing automation' }, { status: 500 })
    }
}

export async function PUT(
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

        const { data: existing, error: existingError } = await supabase
            .from('publishing_automations')
            .select('*')
            .eq('id', automationId)
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        if (existingError) throw existingError
        if (!existing) return NextResponse.json({ error: 'Publishing automation not found' }, { status: 404 })

        assertJsonBodySize(request, 256 * 1024)
        const partial = sanitizeUpdatePublishingAutomationPayload(await request.json())
        if (Object.keys(partial).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
        }

        const currentPayload = rowToPayload(existing as AutomationRow)
        const merged = sanitizeMergedPublishingAutomationPayload(currentPayload, partial)
        const nextIsActive = partial.is_active ?? existing.is_active === true

        if (nextIsActive && merged.approval_mode !== 'manual_review') {
            const readiness = await checkPublishingAutomationReadiness(supabase, activeWorkspace.id, merged.platforms)
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

        const { data: automation, error: updateError } = await supabase
            .from('publishing_automations')
            .update({
                name: merged.name,
                platforms: merged.platforms,
                approval_mode: merged.approval_mode,
                content_goal: merged.content_goal,
                brand_voice: merged.brand_voice || null,
                content_pillars: merged.content_pillars || [],
                excluded_terms: merged.excluded_terms || [],
                cta_config: merged.cta_config || {},
                media_policy: merged.media_policy || {},
                consistency_config: merged.consistency_config || {},
                workflow_config: merged.workflow_config,
                schedule_config: merged.schedule_config,
                daily_cap: merged.daily_cap || 1,
                is_active: nextIsActive,
                updated_at: new Date().toISOString(),
            })
            .eq('id', automationId)
            .eq('workspace_id', activeWorkspace.id)
            .select()
            .single()

        if (updateError) throw updateError

        return NextResponse.json({ success: true, automation })
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid automation id|Invalid publishing automation payload|Automation name is required|Content goal is required|At least one valid platform|Workflow platform mode|Workflow approval mode|Scheduled automation|Instagram scheduled automation|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) return NextResponse.json({ error: errorMessage(error) }, { status: permissionStatus })
        console.error('Update publishing automation API error:', error)
        return NextResponse.json({ error: errorMessage(error) || 'Failed to update publishing automation' }, { status: 500 })
    }
}

export async function DELETE(
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

        const { data: existing, error: existingError } = await supabase
            .from('publishing_automations')
            .select('id')
            .eq('id', automationId)
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        if (existingError) throw existingError
        if (!existing) return NextResponse.json({ error: 'Publishing automation not found' }, { status: 404 })

        const { error } = await supabase
            .from('publishing_automations')
            .delete()
            .eq('id', automationId)
            .eq('workspace_id', activeWorkspace.id)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid automation id/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) return NextResponse.json({ error: errorMessage(error) }, { status: permissionStatus })
        console.error('Delete publishing automation API error:', error)
        return NextResponse.json({ error: errorMessage(error) || 'Failed to delete publishing automation' }, { status: 500 })
    }
}
