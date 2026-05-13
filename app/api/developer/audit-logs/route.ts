import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { canRoleCreateDeveloperApiKey } from "@/lib/developer-api/scopes"

export const runtime = "nodejs"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) return NextResponse.json({ error: "No active workspace" }, { status: 404 })

    const role = await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, "settings:write")
    if (!canRoleCreateDeveloperApiKey(role)) {
      return NextResponse.json({ error: "Only workspace owners and admins can view Developer API audit logs" }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("workspace_api_key_audit_logs")
      .select("id, api_key_id, key_prefix, request_id, method, route, action, scopes_required, status_code, error_code, created_at")
      .eq("workspace_id", activeWorkspace.id)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ logs: data || [] })
  } catch (error) {
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Forbidden" }, { status: permissionStatus })
    }
    console.error("[developer/audit-logs] GET", error)
    return NextResponse.json({ error: "Failed to load Developer API audit logs" }, { status: 500 })
  }
}
