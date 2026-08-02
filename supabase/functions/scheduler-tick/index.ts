
// @ts-nocheck - Deno runtime
/**
 * Scheduler Tick (Supabase Cron target)
 *
 * Runs lightweight scheduler jobs on a single cadence:
 * - process-scheduled-executions (delay node resumes)
 *
 * Configure a Supabase schedule (every minute) to invoke this function.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { invokeEdgeFunction } from "../_shared/edge-invoke.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type JobName =
  | "process-scheduled-executions"
  | "retention-cleanup"
  | "token-health-sweep"

async function runJob(job: JobName, payload: Record<string, unknown> = {}) {
  const startedAt = Date.now()
  const result = await invokeEdgeFunction(job, payload)
  const durationMs = Date.now() - startedAt

  if (!result.ok) {
    console.error("[SCHEDULER_TICK] Job failed", {
      job,
      status: result.status,
      error: result.error,
      data: result.data ?? null,
      durationMs,
    })
    return {
      job,
      ok: false,
      status: result.status,
      error: result.error || "Invocation failed",
      data: result.data ?? null,
      durationMs,
    }
  }

  console.log("[SCHEDULER_TICK] Job completed", {
    job,
    status: result.status,
    durationMs,
  })
  return {
    job,
    ok: true,
    status: result.status,
    data: result.data ?? null,
    durationMs,
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const tickStartedAt = Date.now()
    const jobRuns = [
      runJob("process-scheduled-executions"),
    ]

    // Hourly jobs piggyback on the minute tick at fixed offsets. Retention
    // cleanup enforces RETENTION_CLEANUP_MODE (off by default), a ~daily
    // interval guard, and dry-run-by-default semantics. The token health
    // sweep self-limits to one debug_token check per account per ~day.
    const tickMinute = new Date(tickStartedAt).getMinutes()
    if (tickMinute === 0) {
      jobRuns.push(runJob("retention-cleanup", { triggeredBy: "scheduler" }))
    }
    if (tickMinute === 30) {
      jobRuns.push(runJob("token-health-sweep", { triggeredBy: "scheduler" }))
    }

    const jobs = await Promise.all(jobRuns)
    const hasFailure = jobs.some((job) => !job.ok)
    const payload = {
      success: !hasFailure,
      tick: {
        started_at: new Date(tickStartedAt).toISOString(),
        duration_ms: Date.now() - tickStartedAt,
      },
      jobs,
    }

    return new Response(JSON.stringify(payload), {
      status: hasFailure ? 207 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("[SCHEDULER_TICK] Fatal error:", error)
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || "Scheduler tick failed",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
