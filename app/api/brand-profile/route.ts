import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getActiveWorkspace, getExplicitActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { assertJsonBodySize, sanitizeBrandProfilePayload } from '@/lib/security/phase1-validation'

export async function GET() {
    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace' }, { status: 404 })
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'workspace:read')

        // Fetch brand profile for workspace
        const { data: profile, error } = await supabase
            .from('workspace_brand_profiles')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // If no profile exists, return empty profile structure
        if (!profile) {
            return NextResponse.json({
                workspace_id: activeWorkspace.id,
                business_name: '',
                owner_name: '',
                email: '',
                phone: '',
                website: '',
                industry: '',
                business_description: '',
                target_audience: '',
                brand_voice: 'professional',
                language: 'en',
                services: [],
                unique_selling_points: [],
                instagram_handle: '',
                content_themes: []
            })
        }

        return NextResponse.json(profile)
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid brand profile payload|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json({ error: error instanceof Error ? error.message : 'Forbidden' }, { status: permissionStatus })
        }
        console.error('Brand Profile Fetch Error:', error)
        return NextResponse.json({ error: 'Failed to fetch brand profile' }, { status: 500 })
    }
}

export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const activeWorkspace = await getExplicitActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace' }, { status: 404 })
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'settings:write')

        assertJsonBodySize(request, 256 * 1024)
        const body = sanitizeBrandProfilePayload(await request.json())

        // Check if profile exists
        const { data: existing } = await supabase
            .from('workspace_brand_profiles')
            .select('id')
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        let result
        if (existing) {
            // Update existing profile
            result = await supabase
                .from('workspace_brand_profiles')
                .update({
                    ...body,
                    workspace_id: activeWorkspace.id,
                    updated_at: new Date().toISOString()
                })
                .eq('workspace_id', activeWorkspace.id)
                .select()
                .single()
        } else {
            // Create new profile
            result = await supabase
                .from('workspace_brand_profiles')
                .insert({
                    ...body,
                    workspace_id: activeWorkspace.id
                })
                .select()
                .single()
        }

        if (result.error) {
            return NextResponse.json({ error: result.error.message }, { status: 500 })
        }

        return NextResponse.json(result.data)
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid brand profile payload|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json({ error: error instanceof Error ? error.message : 'Forbidden' }, { status: permissionStatus })
        }
        console.error('Brand Profile Update Error:', error)
        return NextResponse.json({ error: 'Failed to update brand profile' }, { status: 500 })
    }
}
