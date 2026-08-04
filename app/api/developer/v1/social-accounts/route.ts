import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["automations:read"],
      rateLimit: "read",
      action: "social_accounts.read",
      route: "/api/developer/v1/social-accounts",
    },
    async (context) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from("social_accounts")
        .select("id, platform, account_name, account_id, created_at, updated_at")
        .eq("workspace_id", context.workspaceId)
        .eq("platform", "instagram")
        .order("account_name", { ascending: true })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ accounts: data || [] })
    },
  )
}
