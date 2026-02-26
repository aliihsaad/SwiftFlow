import { createClient } from "@/utils/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"

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

        const { data: sessions, error } = await supabase
            .from('chat_sessions')
            .select('id, title, created_at, updated_at')
            .eq('workspace_id', activeWorkspace.id)
            .order('updated_at', { ascending: false })
            .limit(50)

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(sessions)

    } catch (error) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            )
        }
        console.error('Error fetching chat sessions:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
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
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write')

        const body = await request.json()
        const { messages, title } = body

        // If creating a session with initial messages
        const initialTitle = title || (messages && messages.length > 0 ? messages[0].content.slice(0, 50) + "..." : "New Chat")

        const { data: session, error } = await supabase
            .from('chat_sessions')
            .insert({
                workspace_id: activeWorkspace.id,
                user_id: user.id,
                title: initialTitle,
                messages: messages || []
            })
            .select()
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(session)

    } catch (error) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            )
        }
        console.error('Error creating chat session:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
