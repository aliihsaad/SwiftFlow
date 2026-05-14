import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { assertJsonBodySize, assertUuid } from "@/lib/security/phase1-validation"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"
import { validateDeveloperAutomationGraph } from "@/lib/developer-api/automation-graph"
import { buildDeveloperAutomationGraphFromTemplate } from "@/lib/developer-api/automation-templates"

export const runtime = "nodejs"

function text(value: unknown, fallback = "", max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) || fallback : fallback
}

function objectValue(value: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fallback
}

function bodyRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function GET(request: NextRequest) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["automations:read"],
      rateLimit: "read",
      action: "automations.read",
      route: "/api/developer/v1/automations",
    },
    async (context) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from("automations")
        .select("id, social_account_id, type, name, is_active, platform_post_id, post_thumbnail_url, post_caption, trigger_config, comment_reply_config, dm_config, workflow_graph, editor_version, total_triggered, total_dms_sent, created_at, updated_at")
        .eq("workspace_id", context.workspaceId)
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ automations: data || [] })
    },
  )
}

export async function POST(request: NextRequest) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["automations:create"],
      rateLimit: "write",
      action: "automations.create",
      route: "/api/developer/v1/automations",
    },
    async (context) => {
      assertJsonBodySize(request, 256 * 1024)
      const body = await request.json().catch(() => ({}))
      const name = text(body?.name, "", 160)
      if (!name) return NextResponse.json({ error: "Automation name is required" }, { status: 400 })

      let socialAccountId = ""
      try {
        socialAccountId = assertUuid(body?.social_account_id, "social_account_id")
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid social_account_id" }, { status: 400 })
      }

      const admin = createAdminClient()
      const { data: account, error: accountError } = await admin
        .from("social_accounts")
        .select("id, platform")
        .eq("id", socialAccountId)
        .eq("workspace_id", context.workspaceId)
        .maybeSingle()

      if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 })
      if (!account) return NextResponse.json({ error: "Invalid social account for this workspace" }, { status: 400 })

      const requestedActive = body?.is_active === true
      let workflowGraph = body?.workflow_graph
      if (!workflowGraph && text(body?.template_id, "", 120)) {
        const templateResult = buildDeveloperAutomationGraphFromTemplate(bodyRecord(body), {
          socialAccountId,
          platform: account.platform === "facebook" ? "facebook" : "instagram",
        })
        if (templateResult.error) return NextResponse.json({ error: templateResult.error }, { status: 400 })
        workflowGraph = templateResult.graph
      }
      if (!workflowGraph) {
        return NextResponse.json({ error: "Developer API automations require template_id or a configured workflow_graph." }, { status: 400 })
      }
      if (body?.editor_version !== undefined && text(body.editor_version, "", 40) !== "canvas") {
        return NextResponse.json({ error: "Developer API automations must use editor_version canvas." }, { status: 400 })
      }

      const graphValidation = validateDeveloperAutomationGraph(workflowGraph, {
        expectedSocialAccountId: socialAccountId,
        requirePostId: true,
      })
      if (graphValidation.errors.length > 0 || !graphValidation.summary) {
        return NextResponse.json({
          error: "Invalid workflow_graph",
          validationErrors: graphValidation.errors,
        }, { status: 400 })
      }

      const graphSummary = graphValidation.summary
      const { data, error } = await admin
        .from("automations")
        .insert({
          workspace_id: context.workspaceId,
          social_account_id: socialAccountId,
          type: text(body?.type, "comment_to_dm", 80),
          name,
          is_active: requestedActive,
          platform_post_id: graphSummary.platformPostId,
          post_thumbnail_url: graphSummary.postThumbnailUrl,
          post_caption: graphSummary.postCaption,
          trigger_config: graphSummary.triggerConfig,
          comment_reply_config: objectValue(body?.comment_reply_config, { enabled: false, messages: [] }),
          dm_config: objectValue(body?.dm_config, { opening_message: "", button_text: "", link_url: "", link_message: "" }),
          workflow_graph: graphValidation.graph,
          editor_version: "canvas",
        })
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ automation: data }, { status: 201 })
    },
  )
}
