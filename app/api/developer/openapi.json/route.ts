import { NextRequest, NextResponse } from "next/server"
import { buildDeveloperApiOpenApiDocument } from "@/lib/developer-api/openapi"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  return NextResponse.json(buildDeveloperApiOpenApiDocument(new URL(request.url).origin))
}
