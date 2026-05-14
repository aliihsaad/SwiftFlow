import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"
import type { DeveloperApiScope } from "@/lib/developer-api/types"
import { assertJsonBodySize, assertUuid } from "@/lib/security/phase1-validation"
import { getExistingMediaUrls, isJsonRecord } from "@/lib/publishing-automation-run-media"
import { createAdminClient } from "@/utils/supabase/admin"

export const runtime = "nodejs"

const BUCKET = "post_media"
const POST_SELECT = "id, content, media_urls, platforms, status, scheduled_for, published_at, created_at, updated_at"
const MAX_GENERATED_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

type AttachMode = "replace" | "append"
type ReferenceImage = { base64: string; mimeType: string }

type GenerateImagePayload = {
  prompt: string
  style?: string
  postId?: string
  attachMode: AttachMode
  referenceImages: ReferenceImage[]
  referenceMode?: string
  brandImageMode?: string
  transformAction?: string
}

type EdgeInvokeResult = {
  data: unknown
  error: { message?: string } | null
}

function text(value: unknown, max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function parseReferenceImages(value: unknown): ReferenceImage[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isJsonRecord)
    .map((item) => ({
      base64: text(item.base64, 4_000_000),
      mimeType: text(item.mimeType, 80).toLowerCase(),
    }))
    .filter((item) => item.base64 && IMAGE_EXTENSIONS[item.mimeType])
    .slice(0, 4)
}

function parsePayload(raw: unknown): GenerateImagePayload {
  if (!isJsonRecord(raw)) throw new Error("Invalid image generation payload")

  const rawPostId = text(raw.postId ?? raw.post_id, 80)
  const postId = rawPostId ? assertUuid(rawPostId, "post id") : undefined
  return {
    prompt: text(raw.prompt, 4_000),
    style: text(raw.style, 120) || undefined,
    postId,
    attachMode: raw.attachMode === "append" ? "append" : "replace",
    referenceImages: parseReferenceImages(raw.referenceImages),
    referenceMode: text(raw.referenceMode, 80) || undefined,
    brandImageMode: text(raw.brandImageMode, 80) || undefined,
    transformAction: text(raw.transformAction, 80) || undefined,
  }
}

function isPrivateIpv4Host(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return false
  const octets = match.slice(1).map((part) => Number(part))
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) return true
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    octets[0] === 0 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  )
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return (
    !normalized ||
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".lan") ||
    normalized.endsWith(".home") ||
    normalized.endsWith(".test") ||
    normalized.endsWith(".invalid") ||
    isPrivateIpv4Host(normalized)
  )
}

function validateRemoteImageUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Generated image URL must use HTTP or HTTPS")
  if (url.username || url.password || isBlockedHostname(url.hostname)) throw new Error("Generated image URL is not allowed")
  return url.toString()
}

function parseDataUrl(value: string): { buffer: Buffer; contentType: string; extension: string } | null {
  const match = value.match(/^data:([^;,]+);base64,([\s\S]+)$/)
  if (!match) return null
  const contentType = match[1].toLowerCase()
  const extension = IMAGE_EXTENSIONS[contentType]
  if (!extension) throw new Error("Generated image type is unsupported")
  return {
    buffer: Buffer.from(match[2].replace(/\s/g, ""), "base64"),
    contentType,
    extension,
  }
}

function validateImageBuffer(buffer: Buffer) {
  if (buffer.byteLength <= 0) throw new Error("Generated image is empty")
  if (buffer.byteLength > MAX_GENERATED_IMAGE_BYTES) throw new Error("Generated image must be smaller than 10 MB")
}

async function readGeneratedImage(imageUrl: string): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  const dataUrl = parseDataUrl(imageUrl)
  if (dataUrl) {
    validateImageBuffer(dataUrl.buffer)
    return dataUrl
  }

  const response = await fetch(validateRemoteImageUrl(imageUrl))
  if (!response.ok) throw new Error(`Generated image download failed (${response.status})`)

  const contentType = (response.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase()
  const extension = IMAGE_EXTENSIONS[contentType]
  if (!extension) throw new Error("Generated image type is unsupported")

  const buffer = Buffer.from(await response.arrayBuffer())
  validateImageBuffer(buffer)
  return { buffer, contentType, extension }
}

function extractGeneratedImage(data: unknown): { imageUrl: string; model: string | null; promptUsed: string | null } {
  const result = isJsonRecord(data) && isJsonRecord(data.result) ? data.result : {}
  return {
    imageUrl: typeof result.imageUrl === "string" ? result.imageUrl : "",
    model: typeof result.model === "string" ? result.model : null,
    promptUsed: typeof result.prompt_used === "string" ? result.prompt_used : null,
  }
}

function buildStoragePath(workspaceId: string, extension: string) {
  return `${workspaceId}/developer-api/generated/${Date.now()}-${randomUUID()}.${extension}`
}

function generationScopes(postId?: string): DeveloperApiScope[] {
  return postId ? ["media:generate", "posts:update"] : ["media:generate"]
}

export async function POST(request: NextRequest) {
  let raw: unknown
  let payload: GenerateImagePayload
  try {
    assertJsonBodySize(request, 256 * 1024)
    raw = await request.json()
    payload = parsePayload(raw)
    if (!payload.prompt && !payload.postId) throw new Error("prompt is required unless postId is provided")
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid image generation payload" }, { status: 400 })
  }

  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: generationScopes(payload.postId),
      rateLimit: "write",
      action: payload.postId ? "media.generate.attach" : "media.generate",
      route: "/api/developer/v1/media/generate",
    },
    async (context) => {
      const admin = createAdminClient()
      let post: Record<string, unknown> | null = null
      if (payload.postId) {
        const { data, error } = await admin
          .from("posts")
          .select(POST_SELECT)
          .eq("id", payload.postId)
          .eq("workspace_id", context.workspaceId)
          .in("status", ["draft", "scheduled"])
          .maybeSingle()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        if (!data) return NextResponse.json({ error: "Draft or scheduled post not found" }, { status: 404 })
        post = data as Record<string, unknown>
      }

      const postCaption = typeof post?.content === "string" ? post.content.trim() : ""
      const effectivePrompt = payload.prompt || (postCaption ? `Create a social media image for this post caption:\n${postCaption}` : "")
      if (!effectivePrompt) {
        return NextResponse.json({ error: "prompt is required because the selected post has no caption" }, { status: 400 })
      }

      const { data, error } = await admin.functions.invoke("generate-image", {
        body: {
          workspaceId: context.workspaceId,
          prompt: effectivePrompt,
          style: payload.style,
          referenceImages: payload.referenceImages,
          referenceMode: payload.referenceMode,
          brandImageMode: payload.brandImageMode,
          transformAction: payload.transformAction,
          messages: [{ role: "user", content: effectivePrompt }],
        },
      }) as EdgeInvokeResult

      if (error) return NextResponse.json({ error: error.message || "Image generation failed" }, { status: 502 })
      if (isJsonRecord(data) && typeof data.error === "string" && data.error) {
        return NextResponse.json({ error: data.error }, { status: 502 })
      }

      const generated = extractGeneratedImage(data)
      if (!generated.imageUrl) return NextResponse.json({ error: "Image generation completed without returning an image URL" }, { status: 502 })

      let media
      try {
        media = await readGeneratedImage(generated.imageUrl)
      } catch (downloadError) {
        return NextResponse.json({ error: downloadError instanceof Error ? downloadError.message : "Failed to read generated image" }, { status: 502 })
      }

      const path = buildStoragePath(context.workspaceId, media.extension)
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, media.buffer, {
        contentType: media.contentType,
        cacheControl: "3600",
        upsert: false,
      })
      if (uploadError) return NextResponse.json({ error: uploadError.message || "Failed to store generated image" }, { status: 500 })

      const { data: publicData } = admin.storage.from(BUCKET).getPublicUrl(path)
      const publicUrl = publicData.publicUrl
      const mediaResult = {
        bucket: BUCKET,
        path,
        publicUrl,
        url: publicUrl,
        contentType: media.contentType,
        size: media.buffer.byteLength,
        model: generated.model,
        promptUsed: generated.promptUsed || effectivePrompt,
        sourceImageUrl: generated.imageUrl,
      }

      if (!payload.postId || !post) {
        return NextResponse.json({ attached: false, media: mediaResult }, { status: 201 })
      }

      const existingMediaUrls = getExistingMediaUrls(post.media_urls)
      const nextMediaUrls = payload.attachMode === "append"
        ? Array.from(new Set([...existingMediaUrls, publicUrl]))
        : [publicUrl]

      const { data: updatedPost, error: updateError } = await admin
        .from("posts")
        .update({
          media_urls: nextMediaUrls,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.postId)
        .eq("workspace_id", context.workspaceId)
        .in("status", ["draft", "scheduled"])
        .select(POST_SELECT)
        .single()

      if (updateError) return NextResponse.json({ error: updateError.message || "Failed to attach generated image" }, { status: 500 })

      return NextResponse.json({
        attached: true,
        attachMode: payload.attachMode,
        media: mediaResult,
        post: updatedPost,
      }, { status: 201 })
    },
  )
}
