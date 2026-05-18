import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { assertUuid } from "@/lib/security/phase1-validation"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"

export const runtime = "nodejs"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["automations:toggle"],
      rateLimit: "automation_write",
      action: "automations.toggle",
      route: "/api/developer/v1/automations/:id/toggle",
    },
    async (context) => {
      const { id } = await params
      const automationId = assertUuid(id, "automation id")
      const body = await request.json().catch(() => ({}))
      if (typeof body?.is_active !== "boolean") {
        return NextResponse.json({ error: "is_active must be a boolean" }, { status: 400 })
      }

      const admin = createAdminClient()
      const { data: existing, error: existingError } = await admin
        .from("automations")
        .select("id")
        .eq("id", automationId)
        .eq("workspace_id", context.workspaceId)
        .maybeSingle()

      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
      if (!existing) return NextResponse.json({ error: "Automation not found" }, { status: 404 })

      const { data, error } = await admin
        .from("automations")
        .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
        .eq("id", automationId)
        .eq("workspace_id", context.workspaceId)
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ automation: data })
    },
  )
}
