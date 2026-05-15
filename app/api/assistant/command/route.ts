import { NextRequest, NextResponse } from "next/server"

import type { AssistantFunctionName, AssistantMode } from "@/app/dashboard/assistant/assistant-types"
import { AssistantAuthError, resolveAssistantWorkspace } from "@/lib/assistant/auth"
import { buildAssistantContext } from "@/lib/assistant/context-packs"
import { summarizeAssistantContext } from "@/lib/assistant/context-selection"
import type { AssistantCommandRequest } from "@/lib/assistant/context-types"
import { invokeAssistantEdgeFunction } from "@/lib/assistant/edge-invoke"
import { routeAssistantIntent } from "@/lib/assistant/intent-router"
import { assertJsonBodySize, sanitizeAssistantInvokePayload } from "@/lib/security/phase1-validation"
import { enforceRateLimit, getClientIp, RateLimitExceededError } from "@/lib/security/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function readCommandBody(value: unknown): AssistantCommandRequest {
  const body = value && typeof value === "object" ? value as Partial<AssistantCommandRequest> : {}
  const message = typeof body.message === "string" ? body.message.trim() : ""

  if (!message) throw new Error("message is required")
  if (!Array.isArray(body.messages)) throw new Error("messages array is required")

  const selectedMode = typeof body.mode === "string" ? body.mode as AssistantMode : "ask"
  const overrideFunctionName = typeof body.functionName === "string"
    ? body.functionName as AssistantFunctionName
    : undefined
  const routed = routeAssistantIntent({
    message,
    selectedMode,
    overrideFunctionName,
  })

  return {
    message,
    messages: body.messages,
    mode: routed.mode,
    action: routed.action,
    functionName: routed.functionName,
    confidence: routed.confidence,
    needsClarification: routed.needsClarification,
    workspaceId: body.workspaceId,
    selectedContext: body.selectedContext,
  }
}

export async function POST(request: NextRequest) {
  try {
    assertJsonBodySize(request, 256 * 1024)
    const rawBody = await request.json().catch(() => ({}))
    const command = readCommandBody(rawBody)

    if (command.functionName !== "chat-assistant") {
      return NextResponse.json(
        { error: "assistant command only supports chat-assistant in Phase 2" },
        { status: 400 },
      )
    }

    const workspace = await resolveAssistantWorkspace(request, command.workspaceId)
    const clientIp = getClientIp(request)
    await enforceRateLimit(
      { scope: "assistant:command:user", subject: `${workspace.userId}:${workspace.workspaceId}`, limit: 30, windowSeconds: 15 * 60 },
      "Too many AI requests. Please wait a moment and try again.",
    )
    await enforceRateLimit(
      { scope: "assistant:command:ip", subject: clientIp, limit: 60, windowSeconds: 15 * 60 },
      "Too many AI requests. Please wait a moment and try again.",
    )

    const assistantContext = await buildAssistantContext({
      workspaceId: workspace.workspaceId,
      mode: command.mode,
      action: command.action,
      selectedContext: command.selectedContext,
    })
    const contextReceipt = summarizeAssistantContext(assistantContext)

    const invokeBody = {
      ...sanitizeAssistantInvokePayload("chat-assistant", {
        messages: command.messages,
        workspaceId: workspace.workspaceId,
        prompt: command.message,
      }),
      workspaceId: workspace.workspaceId,
      assistantIntent: {
        mode: command.mode,
        action: command.action,
        confidence: command.confidence,
      },
      assistantContext,
    }

    const edgeResult = await invokeAssistantEdgeFunction("chat-assistant", invokeBody)
    if (!edgeResult.ok) {
      const payload = edgeResult.payload && typeof edgeResult.payload === "object"
        ? edgeResult.payload as { error?: unknown }
        : {}
      const details = typeof payload.error === "string" ? payload.error : "Context-aware assistant command failed"
      return NextResponse.json(
        { error: details, contextReceipt },
        { status: edgeResult.status >= 400 ? edgeResult.status : 502 },
      )
    }

    return NextResponse.json({
      data: edgeResult.payload,
      assistantIntent: {
        mode: command.mode,
        action: command.action,
        confidence: command.confidence,
      },
      assistantContext,
      contextReceipt,
    })
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      )
    }

    if (error instanceof AssistantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof Error && /message is required|messages array is required|Invalid assistant payload|Request payload too large|Invalid content length/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("[assistant/command] unexpected error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
