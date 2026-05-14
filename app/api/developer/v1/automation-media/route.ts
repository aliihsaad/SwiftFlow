import { NextRequest, NextResponse } from "next/server"
import { canReadConnectedMediaWithMetaAccount, decryptMetaAccountRow } from "@/lib/meta-account"
import { META_GRAPH_API_BASE_URL } from "@/lib/meta-graph-version"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"
import { createAdminClient } from "@/utils/supabase/admin"

export const runtime = "nodejs"

type SupportedPlatform = "instagram" | "facebook"

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

type FacebookAttachment = {
  media_type?: string
  media?: {
    image?: { src?: string }
    source?: string
  }
  url?: string
  subattachments?: { data?: FacebookAttachment[] }
}

type FacebookPostItem = {
  id: string
  message?: string
  full_picture?: string
  created_time: string
  permalink_url?: string
  attachments?: { data?: FacebookAttachment[] }
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

function normalizeFacebookPostMediaType(item: FacebookPostItem): "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" {
  const firstAttachment = item.attachments?.data?.[0]
  const mediaType = String(firstAttachment?.media_type || "").toLowerCase()

  if (mediaType.includes("video")) return "VIDEO"
  if (firstAttachment?.subattachments?.data?.length) return "CAROUSEL_ALBUM"
  return "IMAGE"
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
        .in("platform", ["instagram", "facebook"])
        .single()

      if (accountError || !account) {
        return NextResponse.json({ error: "Account not found" }, { status: 404 })
      }

      const decryptedAccount = decryptMetaAccountRow(account)
      if (!decryptedAccount.access_token) {
        return NextResponse.json({ error: "No access token available for this account" }, { status: 400 })
      }

      const platform = decryptedAccount.platform === "facebook" ? "facebook" : "instagram"
      if (!canReadConnectedMediaWithMetaAccount(decryptedAccount.metadata, platform)) {
        return NextResponse.json({
          error: "Media access is not available for this connected account",
          errorCode: "meta_missing_permission",
          missingPermissions: platform === "facebook" ? ["pages_manage_posts"] : ["instagram_basic"],
          requiresReconnect: false,
        }, { status: 403 })
      }

      if (platform === "instagram") {
        const mediaUrl =
          `${META_GRAPH_API_BASE_URL}/${decryptedAccount.account_id}/media`
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

        return NextResponse.json({ media, platform, account_id: socialAccountRowId })
      }

      const postsUrl =
        `${META_GRAPH_API_BASE_URL}/${decryptedAccount.account_id}/posts`
        + `?fields=id,message,full_picture,created_time,permalink_url,attachments{media_type,media,url,subattachments}`
        + `&limit=${limit}&access_token=${decryptedAccount.access_token}`

      const response = await fetch(postsUrl, { cache: "no-store" })
      const result = await response.json() as MetaGraphListResponse<FacebookPostItem>

      if (!response.ok) {
        return NextResponse.json({ error: result.error?.message || "Failed to fetch Facebook posts" }, { status: 502 })
      }

      const media = (result.data || []).map((item) => {
        const firstAttachment = item.attachments?.data?.[0]
        const imageFromAttachment =
          firstAttachment?.media?.image?.src
          || firstAttachment?.media?.source
          || firstAttachment?.url
          || firstAttachment?.subattachments?.data?.[0]?.media?.image?.src
          || ""
        const previewImage = item.full_picture || imageFromAttachment || ""

        return {
          id: item.id,
          media_type: normalizeFacebookPostMediaType(item),
          media_url: previewImage,
          thumbnail_url: previewImage,
          caption: item.message || "",
          timestamp: item.created_time,
          permalink: item.permalink_url || "",
        }
      })

      return NextResponse.json({ media, platform: platform as SupportedPlatform, account_id: socialAccountRowId })
    },
  )
}
