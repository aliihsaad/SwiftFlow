import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getExplicitActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { redactSensitiveLogValue } from "@/lib/security/redaction"
import {
  canRoleCreateDeveloperApiKey,
  getDeveloperApiCapabilities,
  getDeveloperApiScopeOptions,
  normalizeDeveloperApiScopes,
} from "@/lib/developer-api/scopes"

export async function GET() {
  return NextResponse.json({ scopeOptions: getDeveloperApiScopeOptions() })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const activeWorkspace = await getExplicitActiveWorkspace()
    if (!activeWorkspace) return NextResponse.json({ error: "No active workspace" }, { status: 404 })
    const role = await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, "settings:write")
    if (!canRoleCreateDeveloperApiKey(role)) {
      return NextResponse.json({ error: "Only workspace owners and admins can inspect Developer API access" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const scopes = normalizeDeveloperApiScopes(Array.isArray(body?.scopes) ? body.scopes : [])
    return NextResponse.json({ scopes, capabilities: getDeveloperApiCapabilities(scopes) })
  } catch (error) {
    if (error instanceof Error && /Unsupported developer API scope|At least one developer API scope/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Forbidden" }, { status: permissionStatus })
    }
    console.error("[developer/access-model] POST", redactSensitiveLogValue(error))
    return NextResponse.json({ error: "Failed to inspect Developer API access" }, { status: 500 })
  }
}
