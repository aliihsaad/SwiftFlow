import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { evaluateActionReplay } from "@/lib/automation/action-replay"
import { assertJsonBodySize, assertUuid } from "@/lib/security/phase1-validation"
import { redactSensitiveLogValue } from "@/lib/security/redaction"
import { requireSupabaseServiceRoleKey } from "@/lib/supabase/service-key"
import { getExplicitActiveWorkspace } from "@/lib/workspace-utils"
import {
  getWorkspacePermissionErrorStatus,
  requireWorkspacePermission,
} from "@/lib/workspace-permissions"
import { createClient } from "@/utils/supabase/server"

type RouteContext = { params: Promise<{ id: string; actionId: string }> }

function replayReason(value: unknown): string {
  if (value == null) return "Manual replay requested"
  if (typeof value !== "string") throw new Error("Replay reason must be text")
  return value.replace(/\s+/g, " ").trim().slice(0, 500) || "Manual replay requested"
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id, actionId } = await params
    const automationId = assertUuid(id, "automation id")
    const outboxId = assertUuid(actionId, "action id")
    assertJsonBodySize(request, 8 * 1024)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const workspace = await getExplicitActiveWorkspace()
    if (!workspace) {
      return NextResponse.json({ error: "No active workspace found" }, { status: 404 })
    }
    await requireWorkspacePermission(supabase, user.id, workspace.id, "automation:write")

    const { data: automation, error: automationError } = await supabase
      .from("automations")
      .select("id")
      .eq("id", automationId)
      .eq("workspace_id", workspace.id)
      .maybeSingle()
    if (automationError) throw automationError
    if (!automation) {
      return NextResponse.json({ error: "Automation not found" }, { status: 404 })
    }

    const body = await request.json().catch(() => ({})) as { reason?: unknown }
    const reason = replayReason(body.reason)
    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      requireSupabaseServiceRoleKey(),
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: action, error: actionError } = await admin
      .from("automation_action_outbox")
      .select("id, status, outcome_ambiguous, last_error_code")
      .eq("id", outboxId)
      .eq("automation_id", automationId)
      .eq("workspace_id", workspace.id)
      .maybeSingle()
    if (actionError) throw actionError
    if (!action) {
      return NextResponse.json({ error: "Automation action not found" }, { status: 404 })
    }

    const eligibility = evaluateActionReplay({
      status: action.status,
      outcomeAmbiguous: action.outcome_ambiguous,
      lastErrorCode: action.last_error_code,
    })
    if (!eligibility.allowed) {
      return NextResponse.json({
        error: eligibility.reason === "ambiguous_provider_outcome"
          ? "This action may already have reached the provider and cannot be replayed safely."
          : "This action is not eligible for replay.",
        reason: eligibility.reason,
      }, { status: 409 })
    }

    const { data, error } = await admin.rpc("request_automation_action_replay", {
      p_action_id: outboxId,
      p_workspace_id: workspace.id,
      p_actor_user_id: user.id,
      p_reason: reason,
    })
    if (error) throw error

    return NextResponse.json({ success: true, action: data?.[0] || null })
  } catch (error: unknown) {
    if (error instanceof Error && /Invalid automation id|Invalid action id|Request payload too large|Replay reason/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Forbidden" }, { status: permissionStatus })
    }
    console.error("Replay automation action API error:", redactSensitiveLogValue(error))
    return NextResponse.json({ error: "Failed to request action replay" }, { status: 500 })
  }
}
