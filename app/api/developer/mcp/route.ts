import { NextRequest, NextResponse } from "next/server"
import {
  handleDeveloperMcpJsonRpc,
  type DeveloperMcpApiRequest,
} from "@/lib/developer-api/mcp"

export const runtime = "nodejs"

type McpJsonRpcRequest = Parameters<typeof handleDeveloperMcpJsonRpc>[0]

class DeveloperMcpApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(message)
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Mcp-Protocol-Version": "2025-03-26",
    },
  })
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { text }
  }
}

async function callDeveloperApi(
  request: NextRequest,
  apiRequest: DeveloperMcpApiRequest,
): Promise<unknown> {
  const authorization = request.headers.get("authorization")
  if (!authorization) {
    throw new DeveloperMcpApiError("Missing Authorization bearer token", 401, {
      error: "Missing Authorization bearer token",
    })
  }

  const response = await fetch(new URL(apiRequest.path, request.nextUrl.origin), {
    method: apiRequest.method,
    headers: {
      authorization,
      ...(apiRequest.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: apiRequest.body === undefined ? undefined : JSON.stringify(apiRequest.body),
    cache: "no-store",
  })
  const payload = await readPayload(response)
  if (!response.ok) {
    throw new DeveloperMcpApiError(
      `Developer API request failed with ${response.status}`,
      response.status,
      payload,
    )
  }
  return payload
}

export async function GET() {
  return jsonResponse({
    name: "swiftflow-developer-api",
    transport: "streamable-http",
    endpoint: "/api/developer/mcp",
    authentication: "Bearer token",
  })
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, OPTIONS",
      "Mcp-Protocol-Version": "2025-03-26",
    },
  })
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Invalid JSON-RPC payload" },
    }, 400)
  }

  const handle = async (message: McpJsonRpcRequest) => handleDeveloperMcpJsonRpc(message, {
    callDeveloperApi: async (apiRequest) => callDeveloperApi(request, apiRequest),
  })

  try {
    if (Array.isArray(body)) {
      const responses = (await Promise.all(body.map((message) => handle(message)))).filter(Boolean)
      return responses.length > 0 ? jsonResponse(responses) : new Response(null, { status: 204 })
    }

    const response = await handle(body as McpJsonRpcRequest)
    return response ? jsonResponse(response) : new Response(null, { status: 204 })
  } catch (error) {
    const status = error instanceof DeveloperMcpApiError ? error.status : 500
    return jsonResponse({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "MCP bridge error",
        data: error instanceof DeveloperMcpApiError ? error.payload : undefined,
      },
    }, status)
  }
}
