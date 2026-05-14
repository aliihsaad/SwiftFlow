import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { assertJsonBodySize, assertUuid, sanitizePostPayload } from "@/lib/security/phase1-validation"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"

export const runtime = "nodejs"

const POST_SELECT = "id, content, media_urls, platforms, status, scheduled_for, published_at, created_at, updated_at"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function mergeDraftPostPayload(existing: Record<string, unknown>, raw: Record<string, unknown>) {
  const existingContent = typeof existing.content === "string" ? existing.content : ""
  const content = typeof raw.content === "string" ? raw.content : existingContent
  const captionByPlatform = isRecord(raw.captionByPlatform)
    ? raw.captionByPlatform
    : { instagram: content }

  return {
    platforms: raw.platforms ?? existing.platforms ?? ["instagram"],
    captionByPlatform,
    mediaUrls: raw.mediaUrls ?? existing.media_urls ?? [],
    status: raw.status === "scheduled" ? "scheduled" : raw.status === "draft" ? "draft" : existing.status,
    scheduledAt: raw.scheduledAt ?? existing.scheduled_for ?? undefined,
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["posts:update"],
      rateLimit: "write",
      action: "posts.drafts.update",
      route: "/api/developer/v1/posts/drafts/:id",
    },
    async (context) => {
      const { id } = await params
      const postId = assertUuid(id, "post id")
      assertJsonBodySize(request, 256 * 1024)
      const rawBody = await request.json().catch(() => ({}))
      const raw = isRecord(rawBody) ? rawBody : {}
      const admin = createAdminClient()
      const { data: existing, error: fetchError } = await admin
        .from("posts")
        .select(POST_SELECT)
        .eq("id", postId)
        .eq("workspace_id", context.workspaceId)
        .in("status", ["draft", "scheduled"])
        .maybeSingle()

      if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
      if (!existing) return NextResponse.json({ error: "Draft or scheduled post not found" }, { status: 404 })

      let payload
      try {
        payload = sanitizePostPayload({ ...mergeDraftPostPayload(existing, raw), id: postId })
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid post payload" }, { status: 400 })
      }
      const mainCaption = payload.captionByPlatform.instagram || payload.captionByPlatform.facebook || ""
      const { data, error } = await admin
        .from("posts")
        .update({
          content: mainCaption,
          media_urls: payload.mediaUrls || [],
          platforms: payload.platforms,
          status: payload.status,
          scheduled_for: payload.status === "scheduled" ? payload.scheduledAt : null,
          published_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId)
        .eq("workspace_id", context.workspaceId)
        .in("status", ["draft", "scheduled"])
        .select(POST_SELECT)
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ post: data })
    },
  )
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["posts:delete"],
      rateLimit: "write",
      action: "posts.drafts.delete",
      route: "/api/developer/v1/posts/drafts/:id",
    },
    async (context) => {
      const { id } = await params
      const postId = assertUuid(id, "post id")
      const admin = createAdminClient()
      const { data: existing, error: fetchError } = await admin
        .from("posts")
        .select(POST_SELECT)
        .eq("id", postId)
        .eq("workspace_id", context.workspaceId)
        .in("status", ["draft", "scheduled"])
        .maybeSingle()

      if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
      if (!existing) return NextResponse.json({ error: "Draft or scheduled post not found" }, { status: 404 })

      const { data, error } = await admin
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("workspace_id", context.workspaceId)
        .in("status", ["draft", "scheduled"])
        .select(POST_SELECT)
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ deleted: true, post: data })
    },
  )
}
