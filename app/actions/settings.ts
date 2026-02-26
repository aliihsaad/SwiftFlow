'use server'

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { UpdateSettingsInput, WorkspaceSettings } from "@/types/settings"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { getDefaultModelForProvider } from "@/lib/ai-models"
import { requireWorkspacePermission } from "@/lib/workspace-permissions"
import { decryptSecretIfNeeded, encryptSecretIfNeeded, normalizeOptionalSecretInput } from "@/lib/secret-crypto"

export async function togglePageSelection(platform: string, pageId: string, selected: boolean) {
    const supabase = await createClient()
    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, "integrations:write")

    // Get the account
    const { data: account } = await supabase
        .from('social_accounts')
        .select('*')
        .eq('platform', platform)
        .eq('workspace_id', activeWorkspace.id)
        .single()

    if (!account || !account.metadata || !account.metadata.pages) return

    const updatedPages = account.metadata.pages.map((p: { id?: string; [key: string]: unknown }) => {
        if (p.id === pageId) {
            return { ...p, selected }
        }
        return p
    })

    await supabase
        .from('social_accounts')
        .update({
            metadata: {
                ...account.metadata,
                pages: updatedPages
            }
        })
        .eq('id', account.id)

    revalidatePath('/dashboard/settings')
}

/**
 * Get workspace settings (simplified - no RLS)
 */
export async function getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings | null> {
    const supabase = await createClient()

    // Query for settings
    const { data, error } = await supabase
        .from('workspace_settings')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle()

    if (error) {
        console.error('Error fetching workspace settings:', error)
        return null
    }

    // If no settings exist, return default structure (or create them)
    // For now, we return a default structure so the UI doesn't crash
    if (!data) {
        return {
            id: 'temp-id',
            workspace_id: workspaceId,
            ai_provider: 'gemini',
            ai_model_name: getDefaultModelForProvider('gemini'),
            ai_temperature: 0.7,
            ai_max_tokens: 2048,
            timezone: 'UTC',
            default_language: 'en',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        } as WorkspaceSettings
    }

    return {
        ...(data as WorkspaceSettings),
        gemini_api_key: decryptSecretIfNeeded(data.gemini_api_key),
        openai_api_key: decryptSecretIfNeeded(data.openai_api_key),
    } as WorkspaceSettings
}

/**
 * Get current workspace settings
 */
export async function getCurrentWorkspaceSettings(): Promise<WorkspaceSettings | null> {
    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) {
        return null
    }

    return getWorkspaceSettings(activeWorkspace.id)
}

/**
 * Update workspace settings (simplified - no permission checks)
 */
export async function updateWorkspaceSettings(
    workspaceId: string,
    settings: UpdateSettingsInput
): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        throw new Error("Unauthorized")
    }

    // Validate membership first to avoid opaque RLS errors on upsert.
    const { data: membership, error: membershipError } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .maybeSingle()

    if (membershipError) {
        console.error('Error checking workspace membership:', membershipError)
        throw new Error("Failed to validate workspace access")
    }

    if (!membership) {
        throw new Error("No access to the selected workspace")
    }

    await requireWorkspacePermission(supabase, user.id, workspaceId, "settings:write")

    const updatePayload = {
        workspace_id: workspaceId,
        ...settings,
        gemini_api_key: encryptSecretIfNeeded(normalizeOptionalSecretInput(settings.gemini_api_key)),
        openai_api_key: encryptSecretIfNeeded(normalizeOptionalSecretInput(settings.openai_api_key)),
        ai_model_name: settings.ai_model_name?.trim(),
    }

    // Use UPSERT to create or update
    const { error } = await supabase
        .from('workspace_settings')
        .upsert(updatePayload, {
            onConflict: 'workspace_id'
        })

    if (error) {
        console.error('Error updating workspace settings:', error)
        throw new Error(`Failed to update settings: ${error.message}`)
    }

    revalidatePath('/dashboard/settings')
}

/**
 * Update current workspace settings
 */
export async function updateCurrentWorkspaceSettings(
    settings: UpdateSettingsInput
): Promise<void> {
    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) {
        const { cookies } = await import('next/headers')
        const cookieStore = await cookies()
        cookieStore.delete('active_workspace_id')
        throw new Error("No active workspace. Create or switch to a workspace first.")
    }

    await updateWorkspaceSettings(activeWorkspace.id, settings)
}
