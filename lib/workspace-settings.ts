import "server-only"

import { getDefaultModelForProvider } from "@/lib/ai-models"
import { decryptSecretIfNeeded } from "@/lib/secret-crypto"
import type { WorkspaceSettings } from "@/types/settings"
import { createClient } from "@/utils/supabase/server"

function defaultWorkspaceSettings(workspaceId: string): WorkspaceSettings {
  return {
    id: "temp-id",
    workspace_id: workspaceId,
    ai_provider: "openrouter",
    openrouter_api_key: null,
    gemini_api_key: null,
    openai_api_key: null,
    ai_text_model_name: getDefaultModelForProvider("openrouter"),
    ai_model_name: getDefaultModelForProvider("openrouter"),
    ai_temperature: 0.7,
    ai_max_tokens: 2048,
    timezone: "UTC",
    default_language: "en",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

/**
 * Trusted server-only settings reader. The returned object may contain
 * decrypted provider credentials and must never cross a browser boundary.
 */
export async function getWorkspaceSettingsWithSecrets(
  workspaceId: string,
): Promise<WorkspaceSettings | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspace_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (error) {
    console.error("Error fetching workspace settings:", error)
    return null
  }
  if (!data) return defaultWorkspaceSettings(workspaceId)

  return {
    ...(data as WorkspaceSettings),
    openrouter_api_key: decryptSecretIfNeeded(data.openrouter_api_key),
    gemini_api_key: decryptSecretIfNeeded(data.gemini_api_key),
    openai_api_key: decryptSecretIfNeeded(data.openai_api_key),
  }
}
