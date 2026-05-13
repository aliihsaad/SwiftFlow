import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import {
  assertJsonBodySize,
  sanitizeBrandProfilePayload,
  sanitizePartialBrandProfilePayload,
} from "@/lib/security/phase1-validation"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"

export const runtime = "nodejs"

function emptyBrandProfile(workspaceId: string) {
  return {
    workspace_id: workspaceId,
    business_name: "",
    owner_name: "",
    email: "",
    phone: "",
    website: "",
    industry: "",
    business_description: "",
    target_audience: "",
    brand_voice: "professional",
    language: "en",
    services: [],
    unique_selling_points: [],
    logo_url: "",
    brand_colors: {
      enabled: true,
      primary: "#000000",
      secondary: "#666666",
      accent: "#0066CC",
    },
    reference_image_urls: [],
    instagram_handle: "",
    facebook_page: "",
    content_themes: [],
  }
}

type BrandProfileRow = ReturnType<typeof emptyBrandProfile> & {
  id?: string
  created_at?: string
  updated_at?: string
}

function mergePartialBrandProfile(existing: BrandProfileRow, partial: Record<string, unknown>) {
  return {
    ...existing,
    ...partial,
    brand_colors: "brand_colors" in partial
      ? {
        ...(existing.brand_colors || {}),
        ...(typeof partial.brand_colors === "object" && partial.brand_colors !== null ? partial.brand_colors : {}),
      }
      : existing.brand_colors,
    workspace_id: existing.workspace_id,
  }
}

export async function GET(request: NextRequest) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["brand:read"],
      rateLimit: "read",
      action: "brand_profile.read",
      route: "/api/developer/v1/brand-profile",
    },
    async (context) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from("workspace_brand_profiles")
        .select("*")
        .eq("workspace_id", context.workspaceId)
        .maybeSingle()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ brandProfile: data || emptyBrandProfile(context.workspaceId) })
    },
  )
}

export async function PUT(request: NextRequest) {
  return writeBrandProfile(request, "replace")
}

export async function PATCH(request: NextRequest) {
  return writeBrandProfile(request, "partial")
}

function writeBrandProfile(request: NextRequest, mode: "replace" | "partial") {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["brand:write"],
      rateLimit: "write",
      action: "brand_profile.write",
      route: "/api/developer/v1/brand-profile",
    },
    async (context) => {
      assertJsonBodySize(request, 256 * 1024)
      const rawBody = await request.json()
      const admin = createAdminClient()
      const { data: existing } = await admin
        .from("workspace_brand_profiles")
        .select("*")
        .eq("workspace_id", context.workspaceId)
        .maybeSingle()
      const current = existing || emptyBrandProfile(context.workspaceId)
      const body = mode === "partial"
        ? mergePartialBrandProfile(current, sanitizePartialBrandProfilePayload(rawBody))
        : sanitizeBrandProfilePayload(rawBody)

      const result = existing
        ? await admin
          .from("workspace_brand_profiles")
          .update({ ...body, workspace_id: context.workspaceId, updated_at: new Date().toISOString() })
          .eq("workspace_id", context.workspaceId)
          .select()
          .single()
        : await admin
          .from("workspace_brand_profiles")
          .insert({ ...body, workspace_id: context.workspaceId })
          .select()
          .single()

      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
      return NextResponse.json({ brandProfile: result.data })
    },
  )
}
