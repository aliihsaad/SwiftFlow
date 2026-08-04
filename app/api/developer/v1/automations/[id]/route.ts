import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { assertJsonBodySize, assertUuid } from "@/lib/security/phase1-validation"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"
import { validateDeveloperAutomationGraph } from "@/lib/developer-api/automation-graph"
import { buildDeveloperAutomationGraphFromTemplate } from "@/lib/developer-api/automation-templates"

export const runtime = "nodejs"

function text(value: unknown, max = 240): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, max) : undefined
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function bodyRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["automations:read"],
      rateLimit: "read",
      action: "automations.read_one",
      route: "/api/developer/v1/automations/:id",
    },
    async (context) => {
      const { id } = await params
      const automationId = assertUuid(id, "automation id")
      const admin = createAdminClient()
      const { data, error } = await admin
        .from("automations")
        .select("*")
        .eq("id", automationId)
        .eq("workspace_id", context.workspaceId)
          .maybeSingle()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data) return NextResponse.json({ error: "Automation not found" }, { status: 404 })
      return NextResponse.json({ automation: data })
    },
  )
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["automations:update"],
      rateLimit: "automation_write",
      action: "automations.update",
      route: "/api/developer/v1/automations/:id",
    },
    async (context) => {
      const { id } = await params
      const automationId = assertUuid(id, "automation id")
      assertJsonBodySize(request, 256 * 1024)
      const body = await request.json().catch(() => ({}))
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (body?.name !== undefined) update.name = text(body.name, 160)
      if (body?.platform_post_id !== undefined) update.platform_post_id = text(body.platform_post_id, 255)
      if (body?.post_thumbnail_url !== undefined) update.post_thumbnail_url = text(body.post_thumbnail_url, 2048) || null
      if (body?.post_caption !== undefined) update.post_caption = text(body.post_caption, 4000) || null
      const triggerConfig = objectValue(body?.trigger_config)
      const commentReplyConfig = objectValue(body?.comment_reply_config)
      const dmConfig = objectValue(body?.dm_config)
      let graphSocialAccountId: string | null = null
      if (triggerConfig !== undefined) update.trigger_config = triggerConfig
      if (commentReplyConfig !== undefined) update.comment_reply_config = commentReplyConfig
      if (dmConfig !== undefined) update.dm_config = dmConfig
      if (body?.editor_version !== undefined && text(body.editor_version, 40) !== "canvas") {
        return NextResponse.json({ error: "Developer API automations must use editor_version canvas." }, { status: 400 })
      }
      const admin = createAdminClient()
      const { data: existing, error: existingError } = await admin
        .from("automations")
        .select("id, social_account_id")
        .eq("id", automationId)
        .eq("workspace_id", context.workspaceId)
          .maybeSingle()

      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
      if (!existing) return NextResponse.json({ error: "Automation not found" }, { status: 404 })

      let workflowGraph = body?.workflow_graph
      if (workflowGraph === undefined && text(body?.template_id, 120)) {
        const socialAccountId = text(body?.social_account_id, 80) || text(existing.social_account_id, 80) || ""
        const { data: account, error: accountError } = await admin
          .from("social_accounts")
          .select("id, platform")
          .eq("id", socialAccountId)
          .eq("workspace_id", context.workspaceId)
          .maybeSingle()

        if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 })
        if (!account) return NextResponse.json({ error: "Invalid social account for this workspace" }, { status: 400 })

        const templateResult = buildDeveloperAutomationGraphFromTemplate(bodyRecord(body), {
          socialAccountId,
          platform: "instagram",
        })
        if (templateResult.error) return NextResponse.json({ error: templateResult.error }, { status: 400 })
        workflowGraph = templateResult.graph
      }

      if (workflowGraph !== undefined) {
        const graphValidation = validateDeveloperAutomationGraph(workflowGraph, { requirePostId: true })
        if (graphValidation.errors.length > 0 || !graphValidation.summary) {
          return NextResponse.json({
            error: "Invalid workflow_graph",
            validationErrors: graphValidation.errors,
          }, { status: 400 })
        }
        update.workflow_graph = graphValidation.graph
        update.editor_version = "canvas"
        update.social_account_id = graphValidation.summary.socialAccountId
        graphSocialAccountId = graphValidation.summary.socialAccountId
        update.platform_post_id = graphValidation.summary.platformPostId
        update.post_thumbnail_url = graphValidation.summary.postThumbnailUrl
        update.post_caption = graphValidation.summary.postCaption
        update.trigger_config = graphValidation.summary.triggerConfig
      } else if (body?.editor_version !== undefined) {
        update.editor_version = "canvas"
      }

      if (graphSocialAccountId) {
        const { data: account, error: accountError } = await admin
          .from("social_accounts")
          .select("id")
          .eq("id", graphSocialAccountId)
          .eq("workspace_id", context.workspaceId)
          .maybeSingle()

        if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 })
        if (!account) return NextResponse.json({ error: "Invalid social account for this workspace" }, { status: 400 })
      }

      const { data, error } = await admin
        .from("automations")
        .update(update)
        .eq("id", automationId)
        .eq("workspace_id", context.workspaceId)
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ automation: data })
    },
  )
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["automations:delete"],
      rateLimit: "automation_write",
      action: "automations.delete",
      route: "/api/developer/v1/automations/:id",
    },
    async (context) => {
      const { id } = await params
      const automationId = assertUuid(id, "automation id")
      const admin = createAdminClient()
      const { data, error } = await admin
        .from("automations")
        .delete()
        .eq("id", automationId)
        .eq("workspace_id", context.workspaceId)
        .select()
        .single()

      if (error) {
        if (/No rows|not found|PGRST116/i.test(error.message)) {
          return NextResponse.json({ error: "Automation not found" }, { status: 404 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, deleted: true, automation: data })
    },
  )
}
