import { createClient } from "@/utils/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const supabase = await createClient()
        const { id } = params

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Verify ownership/workspace access via RLS or explicit check
        const { data: session, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('id', id)
            .single()

        if (error) {
            console.error("Error fetching session details:", error)
            return NextResponse.json({ error: 'Session not found', details: error.message }, { status: 404 })
        }

        return NextResponse.json(session)

    } catch (error) {
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
        const { id } = params
        const body = await request.json()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // We expect body to contain { messages: [...] } or { title: "..." }
        const { data, error } = await supabase
            .from('chat_sessions')
            .update({
                ...body,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(data)

    } catch (error) {
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
        const { id } = params

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { error } = await supabase
            .from('chat_sessions')
            .delete()
            .eq('id', id)

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('Error deleting chat session:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
