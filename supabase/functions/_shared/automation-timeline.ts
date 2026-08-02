// @ts-nocheck - shared Deno runtime helper
import { redactSensitiveLogValue } from "./log-redaction.ts"

export interface AutomationTimelineContext {
  runId?: string
  scheduledExecutionId?: string
  executionKey?: string
}

interface TimelineNode {
  id: string
  data?: {
    type?: string
    label?: string
    config?: Record<string, unknown>
  }
}

interface RecordNodeEventParams {
  supabase: any
  automation: any
  node: TimelineNode
  context: AutomationTimelineContext
  eventType: "started" | "succeeded" | "failed"
  input?: unknown
  output?: unknown
  error?: unknown
  durationMs?: number
}

const MAX_STRING_LENGTH = 4_000
const MAX_ARRAY_ITEMS = 50
const MAX_OBJECT_ENTRIES = 80
const MAX_DEPTH = 5

function boundTimelineValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value
  }
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH)
  if (depth >= MAX_DEPTH) return "[TRUNCATED_DEPTH]"
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => boundTimelineValue(entry, depth + 1))
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_OBJECT_ENTRIES)
        .map(([key, entry]) => [key, boundTimelineValue(entry, depth + 1)]),
    )
  }
  return String(value).slice(0, MAX_STRING_LENGTH)
}

function safeJson(value: unknown): unknown {
  return boundTimelineValue(redactSensitiveLogValue(value ?? {}))
}

function safeText(value: unknown, maximum = 1_000): string | null {
  const redacted = redactSensitiveLogValue(String(value ?? ""))
  const text = typeof redacted === "string" ? redacted.replace(/\s+/g, " ").trim() : ""
  return text ? text.slice(0, maximum) : null
}

function scopeKey(context: AutomationTimelineContext): string {
  if (context.runId) return `run:${context.runId}`
  if (context.scheduledExecutionId) return `scheduled:${context.scheduledExecutionId}`
  if (context.executionKey) return `execution:${context.executionKey}`
  return "unscoped"
}

export async function recordAutomationNodeEvent(
  params: RecordNodeEventParams,
): Promise<void> {
  const { automation, node, context } = params
  const eventKey = [
    "graph",
    `automation:${automation.id}`,
    scopeKey(context),
    `node:${node.id}`,
    "attempt:1",
    params.eventType,
  ].join(":")

  const { error } = await params.supabase
    .from("automation_execution_events")
    .upsert({
      event_key: eventKey,
      workspace_id: automation.workspace_id,
      automation_id: automation.id,
      workflow_version_id:
        automation.workflow_version_id || automation.current_workflow_version_id || null,
      run_id: context.runId || null,
      scheduled_execution_id: context.scheduledExecutionId || null,
      source: "graph",
      event_type: params.eventType,
      node_id: node.id,
      node_type: String(node.data?.type || "unknown"),
      attempt_number: 1,
      replay_number: 0,
      input_redacted: safeJson(params.input),
      output_redacted: safeJson(params.output),
      error_message: safeText(params.error),
      duration_ms:
        Number.isFinite(params.durationMs) && Number(params.durationMs) >= 0
          ? Math.round(Number(params.durationMs))
          : null,
    }, {
      onConflict: "event_key",
      ignoreDuplicates: true,
    })

  if (error) {
    console.error("[AUTOMATION_TIMELINE] Failed to append node event:", redactSensitiveLogValue({
      eventKey,
      error,
    }))
  }
}
