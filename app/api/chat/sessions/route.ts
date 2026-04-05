import { createClient } from "@/utils/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { assertJsonBodySize, sanitizeChatSessionPayload } from "@/lib/security/phase1-validation"

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

        assertJsonBodySize(request, 512 * 1024)
        const { messages, title } = sanitizeChatSessionPayload(await request.json())

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
        if (error instanceof Error && /Invalid chat session payload|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json(
                { error: error.message },
                { status: 400 }
            )
        }
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
