import { NextRequest, NextResponse } from "next/server"

import { evaluateActionReplay } from "@/lib/automation/action-replay"
import { redactAutomationTimelineRecord } from "@/lib/automation/timeline-redaction"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import {
  getWorkspacePermissionErrorStatus,
  requireWorkspacePermission,
} from "@/lib/workspace-permissions"
import { assertUuid } from "@/lib/security/phase1-validation"
import { redactSensitiveLogValue } from "@/lib/security/redaction"
import { createClient } from "@/utils/supabase/server"

type RouteContext = { params: Promise<{ id: string }> }

function parseLimit(request: NextRequest): number {
  const parsed = Number(request.nextUrl.searchParams.get("limit") || 20)
  return Number.isInteger(parsed) ? Math.min(50, Math.max(1, parsed)) : 20
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error"
}

function safeAuditText(value: unknown): string | null {
  if (value == null) return null
  const redacted = redactAutomationTimelineRecord({ value }).value
  return typeof redacted === "string" ? redacted : null
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const automationId = assertUuid(id, "automation id")
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const workspace = await getActiveWorkspace()
    if (!workspace) {
      return NextResponse.json({ error: "No active workspace found" }, { status: 404 })
    }
    await requireWorkspacePermission(supabase, user.id, workspace.id, "workspace:read")

    const { data: automation, error: automationError } = await supabase
      .from("automations")
      .select("id, name")
      .eq("id", automationId)
      .eq("workspace_id", workspace.id)
      .maybeSingle()
    if (automationError) throw automationError
    if (!automation) {
      return NextResponse.json({ error: "Automation not found" }, { status: 404 })
    }

    const limit = parseLimit(request)
    const [runsResult, eventsResult, actionsResult, legacyResult] = await Promise.all([
      supabase
        .from("automation_runs")
        .select("id, workflow_version_id, status, trigger_type, processed_count, dms_sent_count, error_count, error_message, started_at, finished_at, created_at")
        .eq("workspace_id", workspace.id)
        .eq("automation_id", automationId)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("automation_execution_events")
        .select("id, event_key, workflow_version_id, run_id, scheduled_execution_id, action_outbox_id, provider_event_key, source, event_type, node_id, node_type, attempt_number, replay_number, input_redacted, output_redacted, error_code, error_message, duration_ms, actor_user_id, created_at")
        .eq("workspace_id", workspace.id)
        .eq("automation_id", automationId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("automation_action_outbox")
        .select("id, provider, provider_event_key, workflow_version_id, node_id, action_type, target_id, social_account_id, status, attempt_count, max_attempts, available_at, provider_response_id, last_error_code, last_error_message, suppressed_reason, outcome_ambiguous, replay_count, last_replay_requested_at, created_at, updated_at")
        .eq("workspace_id", workspace.id)
        .eq("automation_id", automationId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("automation_node_runs")
        .select("id, run_id, node_id, node_type, status, input, output, error_message, started_at, finished_at, created_at")
        .eq("workspace_id", workspace.id)
        .eq("automation_id", automationId)
        .order("created_at", { ascending: false })
        .limit(200),
    ])

    for (const result of [runsResult, eventsResult, actionsResult, legacyResult]) {
      if (result.error) throw result.error
    }

    const events = [...(eventsResult.data || [])]
    const eventRunNodes = new Set(
      events
        .filter((event) => event.run_id)
        .map((event) => `${event.run_id}:${event.node_id}`),
    )

    for (const node of legacyResult.data || []) {
      if (eventRunNodes.has(`${node.run_id}:${node.node_id}`)) continue
      events.push({
        id: `legacy-${node.id}`,
        event_key: `legacy:${node.id}`,
        workflow_version_id: null,
        run_id: node.run_id,
        scheduled_execution_id: null,
        action_outbox_id: null,
        provider_event_key: null,
        source: "graph",
        event_type: node.status === "completed" ? "succeeded" : node.status,
        node_id: node.node_id,
        node_type: node.node_type,
        attempt_number: 1,
        replay_number: 0,
        input_redacted: redactAutomationTimelineRecord(node.input),
        output_redacted: redactAutomationTimelineRecord(node.output),
        error_code: null,
        error_message: safeAuditText(node.error_message),
        duration_ms:
          node.started_at && node.finished_at
            ? Math.max(0, new Date(node.finished_at).getTime() - new Date(node.started_at).getTime())
            : null,
        actor_user_id: null,
        created_at: node.finished_at || node.created_at,
      })
    }
    events.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

    const actions = (actionsResult.data || []).map((action) => {
      const eligibility = evaluateActionReplay({
        status: action.status,
        outcomeAmbiguous: action.outcome_ambiguous,
        lastErrorCode: action.last_error_code,
      })
      return {
        ...action,
        last_error_message: safeAuditText(action.last_error_message),
        suppressed_reason: safeAuditText(action.suppressed_reason),
        can_replay: eligibility.allowed,
        replay_block_reason: eligibility.reason,
      }
    })

    return NextResponse.json({
      automation,
      runs: (runsResult.data || []).map((run) => ({
        ...run,
        error_message: safeAuditText(run.error_message),
      })),
      events,
      actions,
    })
  } catch (error: unknown) {
    if (error instanceof Error && /Invalid automation id/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json({ error: errorMessage(error) }, { status: permissionStatus })
    }
    console.error("List automation runs API error:", redactSensitiveLogValue(error))
    return NextResponse.json({ error: "Failed to fetch automation run history" }, { status: 500 })
  }
}
