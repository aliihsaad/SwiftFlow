import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { assertJsonBodySize, assertUuid } from "@/lib/security/phase1-validation"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"

export const runtime = "nodejs"

function text(value: unknown, max = 240): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, max) : undefined
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
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
      rateLimit: "write",
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
      if (triggerConfig !== undefined) update.trigger_config = triggerConfig
      if (commentReplyConfig !== undefined) update.comment_reply_config = commentReplyConfig
      if (dmConfig !== undefined) update.dm_config = dmConfig
      if (body?.workflow_graph !== undefined) update.workflow_graph = body.workflow_graph
      if (body?.editor_version !== undefined) update.editor_version = text(body.editor_version, 40)

      const admin = createAdminClient()
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
      rateLimit: "write",
      action: "automations.delete",
      route: "/api/developer/v1/automations/:id",
    },
    async (context) => {
      const { id } = await params
      const automationId = assertUuid(id, "automation id")
      const admin = createAdminClient()
      const { error } = await admin
        .from("automations")
        .delete()
        .eq("id", automationId)
        .eq("workspace_id", context.workspaceId)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    },
  )
}
