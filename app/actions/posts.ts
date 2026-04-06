'use server'

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { redirect } from "next/navigation"

export async function createPostAction(formData: FormData) {
    const content = formData.get('content') as string
    const platforms = JSON.parse(formData.get('platforms') as string || '[]')
    const action = formData.get('action') as string // 'draft', 'schedule', 'post'

    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    console.log("DEBUG: Service Key Present?", !!process.env.SUPABASE_SERVICE_KEY)
    console.log("DEBUG: Admin Client created")


    // Get current user (simple check)
    const { data: { user } } = await supabase.auth.getUser()

    // Validate user
    if (!user) {
        throw new Error("Unauthorized: Please log in to create posts.")
    }

    // Get workspace (using admin client to bypass RLS) using user.id
    // We query for a workspace owned by this user
    let { data: workspace, error: wsError } = await supabaseAdmin
        .from('workspaces')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle()

    if (wsError) {
        console.error("Workspace fetch error:", wsError)
        throw new Error("Could not access workspace: " + wsError.message)
    }

    if (!workspace) {
        // Auto-create workspace if missing
        const { data: newWs, error: createError } = await supabaseAdmin.from('workspaces').insert({
            owner_id: user.id,
            name: "My Workspace"
        }).select().single()

        if (createError) {
            console.error("Workspace create error:", createError)
            throw new Error("Failed to create workspace: " + createError.message)
        }
        workspace = newWs
    }

    const workspaceId = workspace?.id

    if (!workspaceId) {
        throw new Error("No active workspace found")
    }

    const { error } = await supabaseAdmin.from('posts').insert({
        content,
        platforms: { selected: platforms },
        status: action === 'post' ? 'published' : (action === 'schedule' ? 'scheduled' : 'draft'),
        workspace_id: workspaceId,
        posted_at: action === 'post' ? new Date().toISOString() : null,
        scheduled_for: action === 'schedule' ? new Date(Date.now() + 86400000).toISOString() : null
    })

    if (error) {
        console.error("Error creating post:", error)
        throw new Error(error.message)
    }

    if (action === 'schedule') {
        redirect('/dashboard/scheduled')
    } else {
        redirect('/dashboard')
    }
}
