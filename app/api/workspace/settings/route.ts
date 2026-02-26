import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';

/**
 * GET /api/workspace/settings
 * Fetch workspace settings
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
        return NextResponse.json(
            { error: 'Missing workspaceId parameter' },
            { status: 400 }
        );
    }

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await requireWorkspacePermission(supabase, user.id, workspaceId, 'workspace:read');

        const supabaseAdmin = createAdminClient();
        const { data, error } = await supabaseAdmin
            .from('workspace_settings')
            .select('*')
            .eq('workspace_id', workspaceId)
            .maybeSingle();

        if (error) {
            console.error('[WORKSPACE_SETTINGS] Error fetching:', error);
            return NextResponse.json(
                { error: 'Failed to fetch settings' },
                { status: 500 }
            );
        }

        // Return empty object with defaults if no settings exist
        if (!data) {
            return NextResponse.json({
                workspace_id: workspaceId,
                ai_provider: 'gemini',
                timezone: 'UTC',
                default_language: 'en'
            });
        }

        return NextResponse.json(data);
    } catch (error) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            );
        }
        console.error('[WORKSPACE_SETTINGS] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/workspace/settings
 * Update workspace settings (upsert)
 */
export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { workspaceId, ...settings } = body;

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'Missing workspaceId' },
                { status: 400 }
            );
        }

        await requireWorkspacePermission(supabase, user.id, workspaceId, 'settings:write');

        const supabaseAdmin = createAdminClient();

        // Check if settings exist
        const { data: existing } = await supabaseAdmin
            .from('workspace_settings')
            .select('id')
            .eq('workspace_id', workspaceId)
            .maybeSingle();

        let result;

        if (existing) {
            // Update existing settings
            result = await supabaseAdmin
                .from('workspace_settings')
                .update({
                    ...settings,
                    updated_at: new Date().toISOString()
                })
                .eq('workspace_id', workspaceId)
                .select()
                .single();
        } else {
            // Insert new settings
            result = await supabaseAdmin
                .from('workspace_settings')
                .insert({
                    workspace_id: workspaceId,
                    ...settings
                })
                .select()
                .single();
        }

        if (result.error) {
            console.error('[WORKSPACE_SETTINGS] Error saving:', result.error);
            return NextResponse.json(
                { error: 'Failed to save settings' },
                { status: 500 }
            );
        }

        return NextResponse.json(result.data);
    } catch (error) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            );
        }
        console.error('[WORKSPACE_SETTINGS] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
