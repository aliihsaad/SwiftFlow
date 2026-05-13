import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { assertJsonBodySize, assertUuid, sanitizePostPayload } from "@/lib/security/phase1-validation"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"

export const runtime = "nodejs"

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
      const raw = await request.json()
      const payload = sanitizePostPayload({ ...raw, id: postId, status: raw?.status === "scheduled" ? "scheduled" : "draft" })
      const mainCaption = payload.captionByPlatform.instagram || payload.captionByPlatform.facebook || ""
      const admin = createAdminClient()
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
        .select("id, content, media_urls, platforms, status, scheduled_for, published_at, created_at, updated_at")
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ post: data })
    },
  )
}
