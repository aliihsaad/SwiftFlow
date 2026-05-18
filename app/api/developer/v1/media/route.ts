import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { assertJsonBodySize } from "@/lib/security/phase1-validation"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"

export const runtime = "nodejs"

const BUCKET = "post_media"
const MAX_MEDIA_BYTES = 10 * 1024 * 1024
const SUPPORTED_MEDIA_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/ogg": "ogv",
}

function text(value: unknown, max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function parseBase64Media(body: unknown): { base64: string; contentType: string; extension: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid media payload")
  }

  const record = body as Record<string, unknown>
  const rawBase64 = text(record.base64, 16 * 1024 * 1024)
  if (!rawBase64) throw new Error("base64 is required")

  const dataUrlMatch = rawBase64.match(/^data:([^;,]+);base64,([\s\S]+)$/)
  const contentType = (dataUrlMatch ? dataUrlMatch[1] : text(record.mimeType, 120)).toLowerCase()
  if (!SUPPORTED_MEDIA_TYPES[contentType]) throw new Error("Unsupported media type")

  const base64 = (dataUrlMatch ? dataUrlMatch[2] : rawBase64).replace(/\s/g, "")
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw new Error("Invalid base64 media")
  }

  return {
    base64,
    contentType,
    extension: SUPPORTED_MEDIA_TYPES[contentType],
  }
}

function buildStoragePath(workspaceId: string, extension: string) {
  return `${workspaceId}/developer-api/${Date.now()}-${randomUUID()}.${extension}`
}

export async function POST(request: NextRequest) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["media:upload"],
      rateLimit: "media_upload",
      action: "media.upload",
      route: "/api/developer/v1/media",
    },
    async (context) => {
      try {
        assertJsonBodySize(request, 16 * 1024 * 1024)
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Request payload too large" }, { status: 400 })
      }

      const body = await request.json().catch(() => ({}))

      let media
      try {
        media = parseBase64Media(body)
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid media payload" }, { status: 400 })
      }

      const buffer = Buffer.from(media.base64, "base64")
      if (buffer.byteLength <= 0) {
        return NextResponse.json({ error: "Media file is empty" }, { status: 400 })
      }
      if (buffer.byteLength > MAX_MEDIA_BYTES) {
        return NextResponse.json({ error: "Media must be smaller than 10 MB" }, { status: 400 })
      }

      const admin = createAdminClient()
      const path = buildStoragePath(context.workspaceId, media.extension)
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType: media.contentType,
          cacheControl: "3600",
          upsert: false,
        })

      if (error) return NextResponse.json({ error: error.message || "Failed to upload media" }, { status: 500 })

      const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
      return NextResponse.json({
        bucket: BUCKET,
        path,
        publicUrl: data.publicUrl,
        url: data.publicUrl,
        contentType: media.contentType,
        size: buffer.byteLength,
      }, { status: 201 })
    },
  )
}
