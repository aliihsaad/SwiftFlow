import type { NextRequest } from "next/server"

import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

export class AssistantAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = "AssistantAuthError"
  }
}

export interface AssistantWorkspaceContext {
  userId: string
  workspaceId: string
}

export async function resolveAssistantWorkspace(
  request: NextRequest,
  requestedWorkspaceId?: unknown,
): Promise<AssistantWorkspaceContext> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new AssistantAuthError("Unauthorized", 401)
  }

  // Assistant routes can write; require an explicit workspace selection
  // (request body or cookie) and never fall back to the first membership.
  const bodyWorkspaceId = typeof requestedWorkspaceId === "string" ? requestedWorkspaceId : null
  const cookieWorkspaceId = request.cookies.get("active_workspace_id")?.value || null
  const workspaceId = bodyWorkspaceId || cookieWorkspaceId

  if (!workspaceId) {
    throw new AssistantAuthError("No workspace selected", 400)
  }

  const supabaseAdmin = createAdminClient()
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (membershipError) {
    throw new AssistantAuthError(`Failed to resolve workspace membership: ${membershipError.message}`, 500)
  }

  if (!membership) {
    throw new AssistantAuthError("No access to the selected workspace", 403)
  }

  return { userId: user.id, workspaceId }
}
