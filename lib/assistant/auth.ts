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

  const bodyWorkspaceId = typeof requestedWorkspaceId === "string" ? requestedWorkspaceId : null
  const cookieWorkspaceId = request.cookies.get("active_workspace_id")?.value || null
  const supabaseAdmin = createAdminClient()
  const { data: memberships, error: membershipsError } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })

  if (membershipsError) {
    throw new AssistantAuthError(`Failed to resolve workspace membership: ${membershipsError.message}`, 500)
  }

  if (!memberships || memberships.length === 0) {
    throw new AssistantAuthError("No workspace memberships found for this account", 403)
  }

  const allowedWorkspaceIds = new Set(memberships.map((membership: { workspace_id: string }) => membership.workspace_id))
  const workspaceId = [bodyWorkspaceId, cookieWorkspaceId].find(
    (id): id is string => !!id && allowedWorkspaceIds.has(id),
  ) || memberships[0].workspace_id

  return { userId: user.id, workspaceId }
}
