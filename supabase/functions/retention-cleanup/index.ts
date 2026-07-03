// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck - Deno runtime
/**
 * Retention Cleanup (internal-only, dry-run by default)
 *
 * Applies tier-aware retention policies per workspace: temp data first, then
 * operational logs/runs, then user-visible data (gated by legal hold, cleanup
 * pause, and pending exports), then storage object deletion with retries.
 *
 * Safety model:
 * - RETENTION_CLEANUP_MODE env: "off" (default) | "dry_run" | "enabled".
 *   Destructive deletes require mode=enabled AND a request without
 *   dryRun=true. Everything else only counts and reports.
 * - Internal auth: callable only with the service role key.
 * - Single runner: an atomic claim row in retention_cleanup_runs (partial
 *   unique index on status='running') prevents concurrent runs.
 * - Small batches: at most BATCH_LIMIT rows per table per workspace per run.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { assertInternalInvoke } from "../_shared/internal-auth.ts"
import {
  cutoffIsoDays,
  cutoffIsoHours,
  evaluateCleanupEligibility,
  resolveRetentionPolicy,
  resolveRetentionTier,
  RETENTION_TIER_DEFAULTS,
} from "../_shared/retention-policy.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const BATCH_LIMIT = 500
const STORAGE_DELETE_BATCH = 50
const MAX_STORAGE_DELETE_ATTEMPTS = 5
const MAX_WORKSPACES_PER_RUN = 200
const STALE_RUN_MINUTES = 60
const SCHEDULER_MIN_INTERVAL_HOURS = 20

type CleanupMode = "off" | "dry_run" | "enabled"

function getCleanupMode(): CleanupMode {
  const raw = (Deno.env.get("RETENTION_CLEANUP_MODE") || "").trim().toLowerCase()
  if (raw === "enabled" || raw === "dry_run") return raw
  return "off"
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

/**
 * Counts (dry run) or deletes (destructive) rows in `table` matching the
 * given filters. Deletes fetch a bounded id batch first so no unbounded
 * delete ever runs.
 */
async function cleanupTable(
  supabase,
  options: {
    table: string
    timestampColumn: string
    cutoffIso: string
    dryRun: boolean
    workspaceId?: string
    statusIn?: string[]
  },
): Promise<{ table: string; matched: number; deleted: number; error?: string }> {
  const { table, timestampColumn, cutoffIso, dryRun, workspaceId, statusIn } = options

  const applyFilters = (query) => {
    let q = query.lt(timestampColumn, cutoffIso)
    if (workspaceId) q = q.eq("workspace_id", workspaceId)
    if (statusIn) q = q.in("status", statusIn)
    return q
  }

  if (dryRun) {
    const { count, error } = await applyFilters(
      supabase.from(table).select("id", { count: "exact", head: true }),
    )
    if (error) return { table, matched: 0, deleted: 0, error: error.message }
    return { table, matched: count ?? 0, deleted: 0 }
  }

  const { data: rows, error: selectError } = await applyFilters(
    supabase.from(table).select("id").limit(BATCH_LIMIT),
  )
  if (selectError) return { table, matched: 0, deleted: 0, error: selectError.message }
  if (!rows || rows.length === 0) return { table, matched: 0, deleted: 0 }

  const ids = rows.map((row) => row.id)
  const { error: deleteError } = await supabase.from(table).delete().in("id", ids)
  if (deleteError) return { table, matched: ids.length, deleted: 0, error: deleteError.message }
  return { table, matched: ids.length, deleted: ids.length }
}

/**
 * Marks storage rows for generated assets that are about to be removed so the
 * storage sweep deletes the underlying objects afterwards.
 */
async function markGeneratedAssetStorage(supabase, workspaceId: string, cutoffIso: string): Promise<void> {
  const { data: assets } = await supabase
    .from("generated_assets")
    .select("image_url")
    .eq("workspace_id", workspaceId)
    .lt("created_at", cutoffIso)
    .limit(BATCH_LIMIT)

  const urls = (assets || []).map((a) => a.image_url).filter((u) => typeof u === "string" && u)
  if (urls.length === 0) return

  await supabase
    .from("workspace_storage_objects")
    .update({ status: "pending_delete" })
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .in("public_url", urls)
}

/** Deletes pending storage objects with bounded retries. */
async function sweepStorageObjects(supabase, dryRun: boolean) {
  const { data: pending, error } = await supabase
    .from("workspace_storage_objects")
    .select("id, bucket, object_path, delete_attempts")
    .in("status", ["pending_delete", "delete_failed"])
    .lt("delete_attempts", MAX_STORAGE_DELETE_ATTEMPTS)
    .order("updated_at", { ascending: true })
    .limit(BATCH_LIMIT)

  if (error) return { matched: 0, deleted: 0, failed: 0, error: error.message }
  if (!pending || pending.length === 0) return { matched: 0, deleted: 0, failed: 0 }
  if (dryRun) return { matched: pending.length, deleted: 0, failed: 0 }

  let deleted = 0
  let failed = 0

  const byBucket = new Map<string, typeof pending>()
  for (const row of pending) {
    const list = byBucket.get(row.bucket) || []
    list.push(row)
    byBucket.set(row.bucket, list)
  }

  for (const [bucket, rows] of byBucket) {
    for (let i = 0; i < rows.length; i += STORAGE_DELETE_BATCH) {
      const batch = rows.slice(i, i + STORAGE_DELETE_BATCH)
      const paths = batch.map((row) => row.object_path)
      const { error: removeError } = await supabase.storage.from(bucket).remove(paths)
      const ids = batch.map((row) => row.id)

      if (removeError) {
        failed += batch.length
        for (const row of batch) {
          await supabase
            .from("workspace_storage_objects")
            .update({
              status: "delete_failed",
              delete_attempts: (row.delete_attempts ?? 0) + 1,
              last_delete_error: String(removeError.message || removeError).slice(0, 500),
            })
            .eq("id", row.id)
        }
      } else {
        deleted += batch.length
        await supabase
          .from("workspace_storage_objects")
          .update({ status: "deleted", deleted_at: new Date().toISOString(), last_delete_error: null })
          .in("id", ids)
      }
    }
  }

  return { matched: pending.length, deleted, failed }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const unauthorized = assertInternalInvoke(req, corsHeaders)
  if (unauthorized) return unauthorized

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: "Missing Supabase configuration" }, 500)
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const mode = getCleanupMode()
  const triggeredBy = body.triggeredBy === "scheduler" ? "scheduler" : "manual"
  const requestedWorkspaceId = typeof body.workspaceId === "string" ? body.workspaceId : null

  // Scheduler ticks are a no-op until the operator turns the feature on.
  if (triggeredBy === "scheduler" && mode === "off") {
    return json({ success: true, skipped: true, reason: "retention_cleanup_mode_off" })
  }

  // Destructive deletes require BOTH the env switch and a non-dry-run request.
  const dryRun = body.dryRun === true || mode !== "enabled"

  const now = new Date()

  try {
    // Scheduler interval guard: heavy work at most ~once per day.
    if (triggeredBy === "scheduler") {
      const intervalCutoff = new Date(now.getTime() - SCHEDULER_MIN_INTERVAL_HOURS * 60 * 60 * 1000).toISOString()
      const { data: recentRun } = await supabase
        .from("retention_cleanup_runs")
        .select("id")
        .gte("started_at", intervalCutoff)
        .neq("status", "failed")
        .limit(1)
        .maybeSingle()
      if (recentRun) {
        return json({ success: true, skipped: true, reason: "recent_run_exists" })
      }
    }

    // Reclaim stale runs, then claim the single-runner slot atomically.
    const staleCutoff = new Date(now.getTime() - STALE_RUN_MINUTES * 60 * 1000).toISOString()
    await supabase
      .from("retention_cleanup_runs")
      .update({ status: "failed", finished_at: now.toISOString(), error: "Stale run superseded" })
      .eq("status", "running")
      .lt("started_at", staleCutoff)

    const { data: run, error: claimError } = await supabase
      .from("retention_cleanup_runs")
      .insert({ status: "running", dry_run: dryRun, triggered_by: triggeredBy })
      .select("id")
      .single()

    if (claimError || !run) {
      return json({ success: true, skipped: true, reason: "another_run_active" })
    }

    const summary = {
      mode,
      dry_run: dryRun,
      global: [] as unknown[],
      workspaces: [] as unknown[],
      storage: null as unknown,
    }

    // ── 1. Global temp/ops data (tier-independent defaults) ──────────────
    const globalDefaults = RETENTION_TIER_DEFAULTS.free
    summary.global.push(await cleanupTable(supabase, {
      table: "oauth_page_sessions",
      timestampColumn: "expires_at",
      cutoffIso: cutoffIsoHours(globalDefaults.tempSessionRetentionHours, now),
      dryRun,
    }))
    summary.global.push(await cleanupTable(supabase, {
      table: "workspace_invites",
      timestampColumn: "expires_at",
      cutoffIso: cutoffIsoDays(globalDefaults.inviteRetentionDays, now),
      dryRun,
    }))
    summary.global.push(await cleanupTable(supabase, {
      table: "webhook_events",
      timestampColumn: "received_at",
      cutoffIso: cutoffIsoDays(globalDefaults.logRetentionDays, now),
      dryRun,
    }))
    summary.global.push(await cleanupTable(supabase, {
      table: "automation_logs",
      timestampColumn: "triggered_at",
      cutoffIso: cutoffIsoDays(globalDefaults.logRetentionDays, now),
      dryRun,
    }))

    // ── 2. Per-workspace policy-aware cleanup ─────────────────────────────
    let workspaceIds: string[]
    if (requestedWorkspaceId) {
      workspaceIds = [requestedWorkspaceId]
    } else {
      const { data: workspaces, error: workspacesError } = await supabase
        .from("workspaces")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(MAX_WORKSPACES_PER_RUN)
      if (workspacesError) throw new Error(`Failed to list workspaces: ${workspacesError.message}`)
      workspaceIds = (workspaces || []).map((w) => w.id)
    }

    const [policiesResult, subscriptionsResult] = await Promise.all([
      supabase.from("workspace_retention_policies").select("*").in("workspace_id", workspaceIds),
      supabase
        .from("workspace_subscriptions")
        .select("workspace_id, plan_tier, status, downgrade_grace_until")
        .in("workspace_id", workspaceIds),
    ])
    const policyByWorkspace = new Map((policiesResult.data || []).map((row) => [row.workspace_id, row]))
    const subscriptionByWorkspace = new Map((subscriptionsResult.data || []).map((row) => [row.workspace_id, row]))

    for (const workspaceId of workspaceIds) {
      const policyRow = policyByWorkspace.get(workspaceId) || null
      const eligibility = evaluateCleanupEligibility(policyRow, now)
      if (eligibility.skipWorkspace) {
        summary.workspaces.push({ workspace_id: workspaceId, skipped: true, reason: eligibility.reason })
        continue
      }

      const tier = resolveRetentionTier(subscriptionByWorkspace.get(workspaceId) || null, now)
      const policy = resolveRetentionPolicy(tier, policyRow)
      const logCutoff = cutoffIsoDays(policy.logRetentionDays, now)
      const results: unknown[] = []

      // Operational logs/runs (never user-visible content).
      for (const target of [
        { table: "automation_events", timestampColumn: "created_at" },
        { table: "automation_node_runs", timestampColumn: "created_at" },
        { table: "automation_runs", timestampColumn: "created_at" },
        { table: "processed_comments", timestampColumn: "created_at" },
        { table: "publishing_automation_runs", timestampColumn: "created_at", statusIn: ["completed", "failed", "skipped"] },
      ]) {
        results.push(await cleanupTable(supabase, {
          ...target,
          cutoffIso: logCutoff,
          dryRun,
          workspaceId,
        }))
      }

      // Audit logs.
      results.push(await cleanupTable(supabase, {
        table: "workspace_api_key_audit_logs",
        timestampColumn: "created_at",
        cutoffIso: cutoffIsoDays(policy.auditLogRetentionDays, now),
        dryRun,
        workspaceId,
      }))

      // User-visible history, gated by export/legal-hold state.
      if (!eligibility.skipUserVisible) {
        const messageCutoff = cutoffIsoDays(policy.messageRetentionDays, now)
        results.push(await cleanupTable(supabase, {
          table: "comments",
          timestampColumn: "platform_created_at",
          cutoffIso: messageCutoff,
          dryRun,
          workspaceId,
        }))
        results.push(await cleanupTable(supabase, {
          table: "messages",
          timestampColumn: "platform_created_at",
          cutoffIso: messageCutoff,
          dryRun,
          workspaceId,
        }))

        const assetCutoff = cutoffIsoDays(policy.generatedAssetRetentionDays, now)
        if (!dryRun) {
          await markGeneratedAssetStorage(supabase, workspaceId, assetCutoff)
        }
        results.push(await cleanupTable(supabase, {
          table: "generated_assets",
          timestampColumn: "created_at",
          cutoffIso: assetCutoff,
          dryRun,
          workspaceId,
        }))
      }

      const touched = results.filter((r) => r.matched > 0 || r.error)
      if (touched.length > 0) {
        summary.workspaces.push({
          workspace_id: workspaceId,
          tier,
          export_pending: eligibility.skipUserVisible,
          results: touched,
        })
      }
    }

    // ── 3. Storage object sweep (delete + retry bookkeeping) ─────────────
    summary.storage = await sweepStorageObjects(supabase, dryRun)

    await supabase
      .from("retention_cleanup_runs")
      .update({ status: "completed", finished_at: new Date().toISOString(), summary })
      .eq("id", run.id)

    return json({ success: true, run_id: run.id, dry_run: dryRun, summary })
  } catch (error) {
    console.error("[RETENTION_CLEANUP] Fatal error:", error)
    // Best effort: close the claimed run so the single-runner slot frees up.
    await supabase
      .from("retention_cleanup_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: String(error?.message || error).slice(0, 500),
      })
      .eq("status", "running")
    return json({ success: false, error: error?.message || "Retention cleanup failed" }, 500)
  }
})
