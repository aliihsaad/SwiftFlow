import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'

export async function GET(request: NextRequest) {
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
                services: [],
                unique_selling_points: [],
                logo_url: '',
                brand_colors: {
                    enabled: true,
                    primary: '#000000',
                    secondary: '#666666',
                    accent: '#0066CC',
                },
                reference_image_urls: [],
                instagram_handle: '',
                facebook_page: '',
                content_themes: []
            })
        }

        return NextResponse.json(profile)
    } catch (error: any) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json({ error: error.message || 'Forbidden' }, { status: permissionStatus })
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

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace' }, { status: 404 })
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'settings:write')

        const body = await request.json()

        // Check if profile exists
        const { data: existing } = await supabase
            .from('workspace_brand_profiles')
            .select('id')
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        let result
        if (existing) {
            // Update existing profile
            const { id, ...cleanBody } = body // Remove id from body to avoid PK update issues

            result = await supabase
                .from('workspace_brand_profiles')
                .update({
                    ...cleanBody,
                    workspace_id: activeWorkspace.id,
                    updated_at: new Date().toISOString()
                })
                .eq('workspace_id', activeWorkspace.id)
                .select()
                .single()
        } else {
            // Create new profile
            const { id, ...cleanBody } = body

            result = await supabase
                .from('workspace_brand_profiles')
                .insert({
                    ...cleanBody,
                    workspace_id: activeWorkspace.id
                })
                .select()
                .single()
        }

        if (result.error) {
            return NextResponse.json({ error: result.error.message }, { status: 500 })
        }

        return NextResponse.json(result.data)
    } catch (error: any) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json({ error: error.message || 'Forbidden' }, { status: permissionStatus })
        }
        console.error('Brand Profile Update Error:', error)
        return NextResponse.json({ error: 'Failed to update brand profile' }, { status: 500 })
    }
}
