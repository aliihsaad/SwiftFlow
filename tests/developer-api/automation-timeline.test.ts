import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"

import { evaluateActionReplay } from "@/lib/automation/action-replay"
import {
  assertActionExecutorDatabaseAccess,
  assertActionExecutorDatabaseReady,
} from "@/lib/automation/action-executor-runtime"
import {
  redactAutomationTimelineRecord,
  redactAutomationTimelineValue,
} from "@/lib/automation/timeline-redaction"

const root = process.cwd()

describe("automation timeline redaction", () => {
  it("removes nested credentials and bounds large values before persistence", () => {
    const redacted = redactAutomationTimelineRecord({
      access_token: "EAASUPERSECRET",
      nested: {
        authorization: "Bearer raw-secret",
        callback: "https://example.com/hook?code=oauth-secret",
      },
      message: "x".repeat(10_000),
    })

    expect(redacted.access_token).toBe("[REDACTED]")
    expect(JSON.stringify(redacted)).not.toContain("EAASUPERSECRET")
    expect(JSON.stringify(redacted)).not.toContain("raw-secret")
    expect(JSON.stringify(redacted)).not.toContain("oauth-secret")
    expect(String(redacted.message)).toHaveLength(4_000)
  })

  it("returns a JSON-safe wrapper for primitive audit values", () => {
    expect(redactAutomationTimelineRecord("ok")).toEqual({ value: "ok" })
    expect(redactAutomationTimelineValue(null)).toBeNull()
  })
})

describe("manual action replay safety", () => {
  it("allows suppressed and unambiguous dead-lettered actions", () => {
    expect(evaluateActionReplay({ status: "suppressed" })).toEqual({
      allowed: true,
      reason: "safe_to_replay",
    })
    expect(evaluateActionReplay({
      status: "dead_lettered",
      outcomeAmbiguous: false,
      lastErrorCode: "100",
    })).toEqual({
      allowed: true,
      reason: "safe_to_replay",
    })
  })

  it("blocks active, successful, and ambiguous actions", () => {
    expect(evaluateActionReplay({ status: "pending" }).reason).toBe("action_is_active")
    expect(evaluateActionReplay({ status: "succeeded" }).reason).toBe("action_already_succeeded")
    expect(evaluateActionReplay({
      status: "dead_lettered",
      outcomeAmbiguous: true,
      lastErrorCode: "request_timeout",
    })).toEqual({
      allowed: false,
      reason: "ambiguous_provider_outcome",
    })
  })
})

describe("action executor timeline readiness", () => {
  it("refuses startup when the immutable timeline migration is missing", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        outbox_table: "automation_action_outbox",
        timeline_table: null,
        claim_function: "claim_automation_actions",
      }],
    })
    const database = { query } as unknown as Parameters<
      typeof assertActionExecutorDatabaseReady
    >[0]

    await expect(assertActionExecutorDatabaseReady(database))
      .rejects.toThrow(/outbox, timeline, and runtime-guard migrations/i)
  })

  it("requires append-only timeline access for the executor role", async () => {
    const allowed = {
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
      schema_usage: true,
      schema_create: false,
      outbox_select: true,
      outbox_status_update: true,
      timeline_required_inserts: true,
      claim_execute: true,
      reserve_guard_execute: true,
      record_guard_execute: true,
      token_select: true,
      outbox_insert: false,
      outbox_delete: false,
      outbox_truncate: false,
      timeline_update: false,
      timeline_delete: false,
      timeline_truncate: false,
      refresh_token_select: false,
      inbox_select: false,
      workspaces_select: false,
    }

    const allowedDatabase = {
      query: vi.fn().mockResolvedValue({ rows: [allowed] }),
    } as unknown as Parameters<typeof assertActionExecutorDatabaseAccess>[0]
    await expect(assertActionExecutorDatabaseAccess(allowedDatabase)).resolves.toBeUndefined()

    const missingInsertDatabase = {
      query: vi.fn().mockResolvedValue({
        rows: [{ ...allowed, timeline_required_inserts: false }],
      }),
    } as unknown as Parameters<typeof assertActionExecutorDatabaseAccess>[0]
    await expect(assertActionExecutorDatabaseAccess(missingInsertDatabase))
      .rejects.toThrow(/timeline_required_inserts/)

    const mutableTimelineDatabase = {
      query: vi.fn().mockResolvedValue({
        rows: [{ ...allowed, timeline_update: true }],
      }),
    } as unknown as Parameters<typeof assertActionExecutorDatabaseAccess>[0]
    await expect(assertActionExecutorDatabaseAccess(mutableTimelineDatabase))
      .rejects.toThrow(/timeline_update/)
  })
})

describe("timeline runtime wiring", () => {
  it("records graph nodes, stores only redacted legacy node data, and exposes guarded replay", () => {
    const graph = readFileSync(
      path.join(root, "supabase", "functions", "process-automations", "graph-executor.ts"),
      "utf8",
    )
    const worker = readFileSync(
      path.join(root, "supabase", "functions", "automation-worker-run", "index.ts"),
      "utf8",
    )
    const replayRoute = readFileSync(
      path.join(
        root,
        "app",
        "api",
        "automations",
        "[id]",
        "actions",
        "[actionId]",
        "replay",
        "route.ts",
      ),
      "utf8",
    )
    const directWorker = readFileSync(
      path.join(root, "supabase", "functions", "process-automations", "index.ts"),
      "utf8",
    )
    const providerOutbox = readFileSync(
      path.join(root, "lib", "automation", "postgres-action-outbox.ts"),
      "utf8",
    )

    expect(graph).toContain("recordAutomationNodeEvent")
    expect(graph).toContain("eventType: 'started'")
    expect(graph).toContain("eventType: nodeResult.success ? 'succeeded' : 'failed'")
    expect(worker).toContain("input: redactSensitiveLogValue({")
    expect(worker).toContain("output: redactSensitiveLogValue(nodeResult.output || {})")
    expect(replayRoute).toContain('requireWorkspacePermission(supabase, user.id, workspace.id, "automation:write")')
    expect(replayRoute).toContain("evaluateActionReplay")
    expect(directWorker).toContain("{ executionKey: `comment:${webhookCtx.comment_id}` }")
    expect(providerOutbox).toContain("JSON.stringify(request.payload ?? {})")
    expect(providerOutbox).toContain(
      "JSON.stringify(redactAutomationTimelineRecord(request.payload))",
    )
  })
})
