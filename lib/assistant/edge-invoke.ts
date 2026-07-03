import { buildSupabaseFunctionHeaders, getSupabaseServiceRoleKey } from '@/lib/supabase/service-key'

export type AssistantEdgeFunctionName =
  | "chat-assistant"
  | "generate-image"
  | "generate-ideas"
  | "generate-carousel"
  | "generate-reply"
  | "generate-message-reply"

const ALLOWED_FUNCTIONS = new Set<AssistantEdgeFunctionName>([
  "chat-assistant",
  "generate-image",
  "generate-ideas",
  "generate-carousel",
  "generate-reply",
  "generate-message-reply",
])

export function assertAssistantEdgeFunctionName(value: unknown): AssistantEdgeFunctionName {
  if (typeof value !== "string") {
    throw new Error("functionName is required")
  }

  if (!ALLOWED_FUNCTIONS.has(value as AssistantEdgeFunctionName)) {
    throw new Error(`Function "${value}" is not allowed`)
  }

  return value as AssistantEdgeFunctionName
}


async function parseEdgeResponse(response: Response): Promise<unknown> {
  const rawText = await response.text()
  if (!rawText) return null

  try {
    return JSON.parse(rawText)
  } catch {
    return { error: rawText }
  }
}

export async function invokeAssistantEdgeFunction(
  functionName: AssistantEdgeFunctionName,
  body: Record<string, unknown>,
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = getSupabaseServiceRoleKey()

  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      status: 500,
      payload: { error: "Server config missing Supabase URL or service key" },
    }
  }

  const headers = buildSupabaseFunctionHeaders(serviceKey)

  const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })

  const payload = await parseEdgeResponse(edgeResponse)
  return {
    ok: edgeResponse.ok,
    status: edgeResponse.status,
    payload,
  }
}
