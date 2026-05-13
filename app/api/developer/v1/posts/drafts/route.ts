import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { assertJsonBodySize, sanitizePostPayload } from "@/lib/security/phase1-validation"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["posts:read"],
      rateLimit: "read",
      action: "posts.drafts.read",
      route: "/api/developer/v1/posts/drafts",
    },
    async (context) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from("posts")
        .select("id, content, media_urls, platforms, status, scheduled_for, published_at, created_at, updated_at")
        .eq("workspace_id", context.workspaceId)
        .in("status", ["draft", "scheduled"])
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ posts: data || [] })
    },
  )
}

export async function POST(request: NextRequest) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["posts:create"],
      rateLimit: "write",
      action: "posts.drafts.create",
      route: "/api/developer/v1/posts/drafts",
    },
    async (context) => {
      assertJsonBodySize(request, 256 * 1024)
      const raw = await request.json()
      const payload = sanitizePostPayload({ ...raw, status: "draft" })
      const mainCaption = payload.captionByPlatform.instagram || payload.captionByPlatform.facebook || ""
      const admin = createAdminClient()
      const { data, error } = await admin
        .from("posts")
        .insert({
          workspace_id: context.workspaceId,
          content: mainCaption,
          media_urls: payload.mediaUrls || [],
          platforms: payload.platforms,
          status: "draft",
          scheduled_for: null,
          published_at: null,
          last_publish_error_code: null,
          last_publish_error_message: null,
          last_publish_attempted_at: null,
          last_publish_results: [],
        })
        .select("id, content, media_urls, platforms, status, scheduled_for, published_at, created_at, updated_at")
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ post: data }, { status: 201 })
    },
  )
}
