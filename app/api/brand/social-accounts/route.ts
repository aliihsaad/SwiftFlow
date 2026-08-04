import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'

type DisconnectPlatform = 'instagram'

function isDisconnectPlatform(value: string | null): value is DisconnectPlatform {
    return value === 'instagram'
}

export async function DELETE(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams
        const workspaceId = searchParams.get('workspaceId')
        const platform = searchParams.get('platform')

        if (!workspaceId) {
            return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
        }

        if (!isDisconnectPlatform(platform)) {
            return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        await requireWorkspacePermission(supabase, user.id, workspaceId, 'integrations:write')

        const supabaseAdmin = createAdminClient()
        const { data: deletedAccounts, error } = await supabaseAdmin
            .from('social_accounts')
            .delete()
            .eq('workspace_id', workspaceId)
            .eq('platform', platform)
            .select('id, platform, account_name')

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            disconnectedPlatform: platform,
            removedCount: deletedAccounts?.length || 0,
            removedAccounts: deletedAccounts || [],
        })
    } catch (error) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            )
        }

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to disconnect social account' },
            { status: 500 }
        )
    }
}
