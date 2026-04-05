import { createClient } from "@/utils/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { assertJsonBodySize, assertUuid, sanitizeChatSessionPayload } from "@/lib/security/phase1-validation"

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const supabase = await createClient()
        const id = assertUuid(params.id, 'chat session id')

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace' }, { status: 404 })
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'workspace:read')

        // Verify ownership/workspace access via RLS or explicit check
        const { data: session, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('id', id)
            .eq('workspace_id', activeWorkspace.id)
            .single()

        if (error) {
            console.error("Error fetching session details:", error)
            return NextResponse.json({ error: 'Session not found', details: error.message }, { status: 404 })
        }

        return NextResponse.json(session)

    } catch (error) {
        if (error instanceof Error && error.message === 'Invalid chat session id') {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            )
        }
        console.error('Error fetching chat session:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function PATCH(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const supabase = await createClient()
        const id = assertUuid(params.id, 'chat session id')
        assertJsonBodySize(request, 512 * 1024)
        const body = sanitizeChatSessionPayload(await request.json())

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace' }, { status: 404 })
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write')

        // We expect body to contain { messages: [...] } or { title: "..." }
        const { data, error } = await supabase
            .from('chat_sessions')
            .update({
                ...body,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('workspace_id', activeWorkspace.id)
            .select()
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(data)

    } catch (error) {
        if (error instanceof Error && /Invalid chat session id|Invalid chat session payload|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            )
        }
        console.error('Error updating chat session:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function DELETE(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const supabase = await createClient()
        const id = assertUuid(params.id, 'chat session id')

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace' }, { status: 404 })
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write')

        const { error } = await supabase
            .from('chat_sessions')
            .delete()
            .eq('id', id)
            .eq('workspace_id', activeWorkspace.id)

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        if (error instanceof Error && error.message === 'Invalid chat session id') {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            )
        }
        console.error('Error deleting chat session:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
