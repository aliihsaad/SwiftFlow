import { NextRequest, NextResponse } from "next/server"
import { buildDeveloperOAuthAuthorizationServerMetadata } from "@/lib/developer-api/oauth"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  return NextResponse.json(buildDeveloperOAuthAuthorizationServerMetadata(request.nextUrl.origin), {
    headers: {
      "cache-control": "public, max-age=300",
    },
  })
}
