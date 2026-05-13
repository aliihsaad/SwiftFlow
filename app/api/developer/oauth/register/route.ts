import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST() {
  return NextResponse.json({
    client_id: "chatgpt-swiftflow-connector",
    client_id_issued_at: Math.floor(Date.now() / 1000),
    token_endpoint_auth_method: "none",
    response_types: ["code"],
    grant_types: ["authorization_code"],
  }, { status: 201 })
}
