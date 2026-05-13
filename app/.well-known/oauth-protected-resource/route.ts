import { NextRequest, NextResponse } from "next/server"
import { buildDeveloperOAuthProtectedResourceMetadata } from "@/lib/developer-api/oauth"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  return NextResponse.json(buildDeveloperOAuthProtectedResourceMetadata(request.nextUrl.origin), {
    headers: {
      "cache-control": "public, max-age=300",
    },
  })
}
