// @ts-nocheck - Deno runtime
/**
 * Scheduler Tick (Supabase Cron target)
 *
 * Runs lightweight scheduler jobs on a single cadence:
 * - process-scheduled-posts
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

type JobName = "process-scheduled-posts" | "process-scheduled-executions"

async function runJob(job: JobName) {
  const startedAt = Date.now()
  const result = await invokeEdgeFunction(job, {})
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
    const [scheduledPosts, scheduledExecutions] = await Promise.all([
      runJob("process-scheduled-posts"),
      runJob("process-scheduled-executions"),
    ])

    const jobs = [scheduledPosts, scheduledExecutions]
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

