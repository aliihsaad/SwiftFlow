"use server"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

/**
 * Generate a unique slug from workspace name
 */
function generateSlug(name: string): string {
    const base = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    return `${base}-${randomSuffix}`
}

/**
 * Create a new workspace with proper transaction handling
 */
export async function createWorkspace(name: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const slug = generateSlug(name)

    // Use standard client for creation (relying on RLS)
    // 1. Create workspace
    const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .insert({
            name,
            slug,
            owner_id: user.id
        })
        .select()
        .single()

    if (workspaceError) {
        console.error('Workspace creation error:', workspaceError)
        throw new Error(`Failed to create workspace: ${workspaceError.message}`)
    }

    // 2. Add owner as member
    // RLS policy "Users can add themself as owner" allows this
    const { error: memberError } = await supabase
        .from('workspace_members')
        .insert({
            workspace_id: workspace.id,
            user_id: user.id,
            role: 'owner'
        })

    if (memberError) {
        // Cleanup: Delete the workspace if member insert fails
        // RLS policy "Users can delete their own workspaces" allows this
        await supabase
            .from('workspaces')
            .delete()
            .eq('id', workspace.id)

        console.error('Member creation error:', memberError)
        throw new Error(`Failed to add workspace member: ${memberError.message}`)
    }

    // Set as active workspace
    const cookieStore = await cookies()
    cookieStore.set('active_workspace_id', workspace.id, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
    })

    revalidatePath('/dashboard')
    return workspace
}

/**
 * Rename a workspace
 */
export async function renameWorkspace(workspaceId: string, newName: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // Check if user is owner
    const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('workspace_id', workspaceId)
        .single()

    if (!member) throw new Error("Not a member of this workspace")
    if (member.role !== 'owner') throw new Error("Only workspace owners can rename workspaces")

    const newSlug = generateSlug(newName)

    const { error } = await supabase
        .from('workspaces')
        .update({ name: newName, slug: newSlug })
        .eq('id', workspaceId)

    if (error) {
        console.error('Workspace rename error:', error)
        throw new Error(`Failed to rename workspace: ${error.message}`)
    }

    revalidatePath('/dashboard')
}

/**
 * Delete a workspace (owner only)
 */
export async function deleteWorkspace(workspaceId: string) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // Check if user is owner
    const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('workspace_id', workspaceId)
        .single()

    if (!member) throw new Error("Not a member of this workspace")
    if (member.role !== 'owner') throw new Error("Only workspace owners can delete workspaces")

    // Delete workspace (cascade will handle related records)
    const { error } = await supabaseAdmin
        .from('workspaces')
        .delete()
        .eq('id', workspaceId)

    if (error) {
        console.error('Workspace deletion error:', error)
        throw new Error(`Failed to delete workspace: ${error.message}`)
    }

    // Clear active workspace cookie if this was the active one
    const cookieStore = await cookies()
    const activeWorkspaceId = cookieStore.get('active_workspace_id')?.value
    if (activeWorkspaceId === workspaceId) {
        cookieStore.delete('active_workspace_id')
    }

    revalidatePath('/dashboard')
}

/**
 * Leave a workspace (non-owners only)
 */
export async function leaveWorkspace(workspaceId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // Check membership and role
    const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('workspace_id', workspaceId)
        .single()

    if (!member) throw new Error("Not a member of this workspace")
    if (member.role === 'owner') throw new Error("Owners cannot leave their workspace. Delete it instead.")

    // Remove membership
    const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('user_id', user.id)
        .eq('workspace_id', workspaceId)

    if (error) {
        console.error('Leave workspace error:', error)
        throw new Error(`Failed to leave workspace: ${error.message}`)
    }

    // Clear active workspace cookie if this was the active one
    const cookieStore = await cookies()
    const activeWorkspaceId = cookieStore.get('active_workspace_id')?.value
    if (activeWorkspaceId === workspaceId) {
        cookieStore.delete('active_workspace_id')
    }

    revalidatePath('/dashboard')
}

/**
 * Server Action to switch the active workspace
 */
export async function switchWorkspace(workspaceId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error("Unauthorized")

    // Verify membership
    const { data: member } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('workspace_id', workspaceId)
        .single()

    if (!member) throw new Error("Not a member of this workspace")

    const cookieStore = await cookies()
    cookieStore.set('active_workspace_id', workspaceId, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
    })

    revalidatePath('/dashboard')
}
