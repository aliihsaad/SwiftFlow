'use server'

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { UpdateSettingsInput, WorkspaceSettings } from "@/types/settings"
import { getActiveWorkspace, getExplicitActiveWorkspace,
} from "@/lib/workspace-utils"
import { requireWorkspacePermission } from "@/lib/workspace-permissions"
import { encryptSecret, normalizeOptionalSecretInput,
} from "@/lib/secret-crypto"
import { getWorkspaceSettingsWithSecrets } from "@/lib/workspace-settings"

function sanitizeWorkspaceSettingsForClient(row: WorkspaceSettings,
): WorkspaceSettings {
  const telegramChatId =
    typeof row.telegram_chat_id === 'string' ? row.telegram_chat_id : ''
  return {
        ...row,
        openrouter_api_key: null,
        gemini_api_key: null,
        openai_api_key: null,
    telegram_bot_token: null,
    telegram_chat_id: null,
    telegram_webhook_secret: null,
    has_openrouter_api_key: typeof row.openrouter_api_key === 'string' && row.openrouter_api_key.length > 0,
        has_gemini_api_key: typeof row.gemini_api_key === 'string' && row.gemini_api_key.length > 0,
        has_openai_api_key: typeof row.openai_api_key === 'string' && row.openai_api_key.length > 0,
    has_telegram_bot_token:
      typeof row.telegram_bot_token === 'string' &&
      row.telegram_bot_token.length > 0,
    has_telegram_chat_id: telegramChatId.length > 0,
    telegram_chat_id_hint: telegramChatId
      ? `••••${telegramChatId.slice(-4)}`
      : null,
  }
}

export async function togglePageSelection(platform: string, pageId: string, selected: boolean,
) {
    const supabase = await createClient()
    const activeWorkspace = await getExplicitActiveWorkspace()
    if (!activeWorkspace) {
        throw new Error("No active workspace. Create or switch to a workspace first.",
    )
    }

    const { data: { user },
  } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, "integrations:write",
  )

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
    },
  )

    await supabase
        .from('social_accounts')
        .update({
            metadata: {
                ...account.metadata,
                pages: updatedPages,
      },
    })
        .eq('id', account.id)
        .eq('workspace_id', activeWorkspace.id)

    revalidatePath('/dashboard/settings')
}

/**
 * Browser-safe settings action. Decrypted provider keys are consumed only
 * inside the server-only reader and are replaced with presence flags here.
 */
export async function getWorkspaceSettings(workspaceId: string,
): Promise<WorkspaceSettings | null> {
    // Every export in a 'use server' file is a POST-reachable endpoint, so the
    // caller-supplied workspaceId has to be checked here rather than trusted.
    // RLS on workspace_settings already limits the read, but this keeps the
    // action safe if the reader is ever switched to the admin client.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    await requireWorkspacePermission(supabase, user.id, workspaceId, "workspace:read")

    const settings = await getWorkspaceSettingsWithSecrets(workspaceId)
    return settings ? sanitizeWorkspaceSettingsForClient(settings) : null
}

export async function getWorkspaceSettingsForDisplay(workspaceId: string,
): Promise<WorkspaceSettings | null> {
    return getWorkspaceSettings(workspaceId)
}

export async function getCurrentWorkspaceSettings(): Promise<WorkspaceSettings | null> {
    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) {
        return null
    }

    return getWorkspaceSettings(activeWorkspace.id)
}

export async function getCurrentWorkspaceSettingsForDisplay(): Promise<WorkspaceSettings | null> {
    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) {
        return null
    }

    return getWorkspaceSettingsForDisplay(activeWorkspace.id)
}

export async function updateWorkspaceSettings(
    workspaceId: string,
    settings: UpdateSettingsInput,
): Promise<void> {
    const supabase = await createClient()
    const { data: { user },
  } = await supabase.auth.getUser()

    if (!user) {
        throw new Error("Unauthorized")
    }

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

    await requireWorkspacePermission(supabase, user.id, workspaceId, "settings:write",
  )

    const updatePayload: Record<string, unknown> = {
        workspace_id: workspaceId,
    }

    if (typeof settings.ai_provider === 'string') {
        updatePayload.ai_provider = settings.ai_provider
    }

    const textModelName = settings.ai_text_model_name?.trim() || settings.ai_model_name?.trim()
    if (textModelName) {
        updatePayload.ai_text_model_name = textModelName
        updatePayload.ai_model_name = textModelName
    }


    if (typeof settings.ai_temperature === 'number' && Number.isFinite(settings.ai_temperature)) {
        updatePayload.ai_temperature = settings.ai_temperature
    }
    if (typeof settings.ai_max_tokens === 'number' && Number.isFinite(settings.ai_max_tokens)) {
        updatePayload.ai_max_tokens = settings.ai_max_tokens
    }
    if (typeof settings.timezone === 'string') {
        updatePayload.timezone = settings.timezone
    }
    if (typeof settings.default_language === 'string') {
        updatePayload.default_language = settings.default_language
    }
    if (typeof settings.openrouter_api_key === 'string') {
        const normalized = normalizeOptionalSecretInput(settings.openrouter_api_key)
        if (normalized !== null) {
            updatePayload.openrouter_api_key = encryptSecret(normalized)
        }
    }
    if (typeof settings.gemini_api_key === 'string') {
        const normalized = normalizeOptionalSecretInput(settings.gemini_api_key)
        if (normalized !== null) {
            updatePayload.gemini_api_key = encryptSecret(normalized)
        }
    }
    if (typeof settings.openai_api_key === 'string') {
        const normalized = normalizeOptionalSecretInput(settings.openai_api_key)
        if (normalized !== null) {
            updatePayload.openai_api_key = encryptSecret(normalized)
        }
    }

    const { error } = await supabase
        .from('workspace_settings')
        .upsert(updatePayload, {
            onConflict: 'workspace_id',
    })

    if (error) {
        console.error('Error updating workspace settings:', error)
        throw new Error(`Failed to update settings: ${error.message}`)
    }

    revalidatePath('/dashboard/settings')
}

export async function updateCurrentWorkspaceSettings(
    settings: UpdateSettingsInput,
): Promise<void> {
    const activeWorkspace = await getExplicitActiveWorkspace()
    if (!activeWorkspace) {
        const { cookies } = await import('next/headers')
        const cookieStore = await cookies()
        cookieStore.delete('active_workspace_id')
        throw new Error("No active workspace. Create or switch to a workspace first.",
    )
    }

    await updateWorkspaceSettings(activeWorkspace.id, settings)
}

export async function removeCurrentWorkspaceProviderKey(
    provider: 'openrouter' | 'gemini' | 'openai',
): Promise<void> {
    const activeWorkspace = await getExplicitActiveWorkspace()
    if (!activeWorkspace) {
        throw new Error("No active workspace. Create or switch to a workspace first.",
    )
    }

    const supabase = await createClient()
    const { data: { user },
  } = await supabase.auth.getUser()

    if (!user) {
        throw new Error("Unauthorized")
    }

    await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, "settings:write",
  )

    const keyField =
        provider === 'openrouter'
            ? 'openrouter_api_key'
            : provider === 'gemini'
                ? 'gemini_api_key'
                : 'openai_api_key'

    const { error } = await supabase
        .from('workspace_settings')
        .update({
            [keyField]: null,
            updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', activeWorkspace.id)

    if (error) {
        console.error(`Error removing ${provider} API key:`, error)
        throw new Error(`Failed to remove ${provider} API key`)
    }

    revalidatePath('/dashboard/settings')
}
