import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { assertJsonBodySize, sanitizePostPayload } from "@/lib/security/phase1-validation"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"
import type { DeveloperApiScope } from "@/lib/developer-api/types"

export const runtime = "nodejs"

type EdgeInvokeResult = {
  data: unknown
  error: { message?: string } | null
}

function triggerPublishEdgeFunction() {
  const supabaseAdmin = createAdminClient()
  supabaseAdmin.functions.invoke("process-scheduled-posts").then(
    ({ data, error }: EdgeInvokeResult) => {
      if (error) console.error("[developer-api/posts] Edge function error:", error)
      else console.log("[developer-api/posts] Edge function result:", data)
    },
  ).catch((error: unknown) => {
    console.error("[developer-api/posts] Edge function invoke failed:", error)
  })
}

function normalizeRequestedStatus(value: unknown): "draft" | "scheduled" | "published" {
  return value === "scheduled" || value === "published" ? value : "draft"
}

function scopeForStatus(status: "draft" | "scheduled" | "published"): DeveloperApiScope {
  if (status === "scheduled") return "posts:schedule"
  if (status === "published") return "posts:publish_now"
  return "posts:create"
}

export async function GET(request: NextRequest) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["posts:read"],
      rateLimit: "read",
      action: "posts.read",
      route: "/api/developer/v1/posts",
    },
    async (context) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from("posts")
        .select("id, content, media_urls, platforms, status, scheduled_for, published_at, created_at, updated_at")
        .eq("workspace_id", context.workspaceId)
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ posts: data || [] })
    },
  )
}

export async function POST(request: NextRequest) {
  assertJsonBodySize(request, 256 * 1024)
  const raw = await request.json().catch(() => ({}))
  const requestedStatus = normalizeRequestedStatus(raw?.status)
  const requiredScope = scopeForStatus(requestedStatus)

  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: [requiredScope],
      rateLimit: "write",
      action: requestedStatus === "published" ? "posts.publish_now" : requestedStatus === "scheduled" ? "posts.schedule" : "posts.create",
      route: "/api/developer/v1/posts",
    },
    async (context) => {
      let payload
      try {
        payload = sanitizePostPayload({ ...raw, status: requestedStatus })
        if (requestedStatus === "scheduled" && !payload.scheduledAt) {
          return NextResponse.json({ error: "Scheduled date is required" }, { status: 400 })
        }
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid post payload" }, { status: 400 })
      }

      const mainCaption = payload.captionByPlatform.instagram || payload.captionByPlatform.facebook || ""
      const shouldPublishNow = requestedStatus === "published"
      const admin = createAdminClient()
      const { data, error } = await admin
        .from("posts")
        .insert({
          workspace_id: context.workspaceId,
          content: mainCaption,
          media_urls: payload.mediaUrls || [],
          platforms: payload.platforms,
          status: shouldPublishNow ? "scheduled" : requestedStatus,
          scheduled_for: shouldPublishNow ? new Date().toISOString() : payload.scheduledAt || null,
          published_at: null,
          last_publish_error_code: null,
          last_publish_error_message: null,
          last_publish_attempted_at: null,
          last_publish_results: [],
        })
        .select("id, content, media_urls, platforms, status, scheduled_for, published_at, created_at, updated_at")
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (shouldPublishNow) triggerPublishEdgeFunction()
      return NextResponse.json({ post: data, publishTriggered: shouldPublishNow }, { status: 201 })
    },
  )
}
