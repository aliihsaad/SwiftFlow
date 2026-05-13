import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["workspace:read"],
      rateLimit: "read",
      action: "workspace.read",
      route: "/api/developer/v1/workspace",
    },
    async (context) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from("workspaces")
        .select("id, name, slug, created_at, updated_at")
        .eq("id", context.workspaceId)
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ workspace: data, api: { version: "v1" } })
    },
  )
}
