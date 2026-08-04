import { NextRequest, NextResponse } from "next/server"
import { canReadConnectedMediaWithMetaAccount, decryptMetaAccountRow } from "@/lib/meta-account"
import { getMetaGraphApiBaseUrl } from "@/lib/meta-graph-version"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"
import { createAdminClient } from "@/utils/supabase/admin"

export const runtime = "nodejs"

type MetaGraphError = {
  message?: string
}

type InstagramMediaItem = {
  id: string
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"
  media_url?: string
  thumbnail_url?: string
  caption?: string
  timestamp: string
  permalink?: string
}

type MetaGraphListResponse<T> = {
  data?: T[]
  error?: MetaGraphError
}

function clampLimit(value: string | null): number {
  const parsed = Number.parseInt(value || "25", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 25
  return Math.min(parsed, 50)
}

export async function GET(request: NextRequest) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["automations:read"],
      rateLimit: "read",
      action: "automation_media.read",
      route: "/api/developer/v1/automation-media",
    },
    async (context) => {
      const socialAccountRowId = request.nextUrl.searchParams.get("account_id")
      const limit = clampLimit(request.nextUrl.searchParams.get("limit"))

      if (!socialAccountRowId) {
        return NextResponse.json({ error: "account_id is required" }, { status: 400 })
      }

      const admin = createAdminClient()
      const { data: account, error: accountError } = await admin
        .from("social_accounts")
        .select("*")
        .eq("id", socialAccountRowId)
        .eq("workspace_id", context.workspaceId)
        .eq("platform", "instagram")
        .single()

      if (accountError || !account) {
        return NextResponse.json({ error: "Instagram account not found" }, { status: 404 })
      }

      const decryptedAccount = decryptMetaAccountRow(account)
      const graphBaseUrl = getMetaGraphApiBaseUrl(decryptedAccount.metadata?.connection_method)
      if (!decryptedAccount.access_token) {
        return NextResponse.json({ error: "No access token available for this account" }, { status: 400 })
      }

      if (!canReadConnectedMediaWithMetaAccount(decryptedAccount.metadata, "instagram")) {
        return NextResponse.json({
          error: "Media access is not available for this connected Instagram account",
          errorCode: "meta_missing_permission",
          missingPermissions: ["instagram_basic"],
          requiresReconnect: false,
        }, { status: 403 })
      }

      const mediaUrl =
        `${graphBaseUrl}/${decryptedAccount.account_id}/media`
        + `?fields=id,media_type,media_url,thumbnail_url,caption,timestamp,permalink`
        + `&limit=${limit}&access_token=${decryptedAccount.access_token}`

      const response = await fetch(mediaUrl, { cache: "no-store" })
      const result = await response.json() as MetaGraphListResponse<InstagramMediaItem>

      if (!response.ok) {
        return NextResponse.json({ error: result.error?.message || "Failed to fetch Instagram media" }, { status: 502 })
      }

      const media = (result.data || []).map((item) => ({
        id: item.id,
        media_type: item.media_type,
        media_url: item.media_url || "",
        thumbnail_url: item.thumbnail_url || item.media_url || "",
        caption: item.caption || "",
        timestamp: item.timestamp,
        permalink: item.permalink || "",
      }))

      return NextResponse.json({ media, platform: "instagram", account_id: socialAccountRowId })
    },
  )
}
