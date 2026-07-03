import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { Workspace } from "@/types/workspace"

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Resolve the workspace selected via the 'active_workspace_id' cookie,
 * verifying the user's membership. Returns null when the cookie is missing
 * or does not point to a workspace the user belongs to.
 */
async function resolveExplicitWorkspace(supabase: ServerSupabaseClient, userId: string): Promise<Workspace | null> {
    const cookieStore = await cookies()
    const activeWorkspaceId = cookieStore.get('active_workspace_id')?.value
    if (!activeWorkspaceId) return null

    const { data: member } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .eq('workspace_id', activeWorkspaceId)
        .maybeSingle()

    if (!member) return null

    const { data: workspace } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', activeWorkspaceId)
        .single()

    return workspace ?? null
}

/**
 * Retrieves the currently active workspace for the authenticated user.
 *
 * Intended for read paths (dashboard pages, GET routes): when the cookie is
 * missing or invalid it falls back to the user's first workspace so first
 * loads still work. Mutation routes must use getExplicitActiveWorkspace().
 */
export async function getActiveWorkspace(): Promise<Workspace | null> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const explicit = await resolveExplicitWorkspace(supabase, user.id)
    if (explicit) return explicit

    // Fallback: first available workspace (read-only convenience for initial loads).
    const { data: member } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

    if (!member) return null

    const { data: workspace } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', member.workspace_id)
        .single()

    return workspace ?? null
}

/**
 * Strict variant for mutation and other write paths: only honors an explicit,
 * membership-verified 'active_workspace_id' cookie and never silently falls
 * back to the user's first workspace. Callers must reject the request
 * (400/404) when this returns null.
 */
export async function getExplicitActiveWorkspace(): Promise<Workspace | null> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    return resolveExplicitWorkspace(supabase, user.id)
}
