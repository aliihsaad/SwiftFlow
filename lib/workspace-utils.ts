import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Workspace } from "@/types/workspace"

/**
 * Retrieves the currently active workspace for the authenticated user.
 * 
 * Strategy:
 * 1. Check 'active_workspace_id' cookie.
 * 2. If present, verify membership.
 * 3. If missing or invalid, fetch user's first workspace and set it as active.
 * 4. If user has no workspaces, return null (caller should redirect to onboarding).
 */
export async function getActiveWorkspace(): Promise<Workspace | null> {
    const supabase = await createClient()
    const cookieStore = await cookies()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const activeWorkspaceId = cookieStore.get('active_workspace_id')?.value

    if (activeWorkspaceId) {
        // Verify membership and get details
        const { data: member } = await supabase
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .eq('workspace_id', activeWorkspaceId)
            .single()

        if (member) {
            const { data: workspace } = await supabase
                .from('workspaces')
                .select('*')
                .eq('id', activeWorkspaceId)
                .single()

            if (workspace) return workspace
        }
    }

    // Fallback: Get first available workspace
    const { data: member } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

    if (member) {
        const { data: workspace } = await supabase
            .from('workspaces')
            .select('*')
            .eq('id', member.workspace_id)
            .single()

        if (workspace) {
            // Set as active for future requests
            // Note: We can't set cookies in a server component (GET), 
            // but we can rely on the middleware to stick it, or just return it here.
            // Ideally, the middleware ensures the cookie is set.
            return workspace
        }
    }

    return null
}


