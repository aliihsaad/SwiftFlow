import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { timingSafeStringEqual } from '@/lib/developer-api/key-format'

export const runtime = 'nodejs'
export const maxDuration = 60

type JobName = 'process-scheduled-executions'

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret) {
    return timingSafeStringEqual(request.headers.get('authorization') || '', `Bearer ${cronSecret}`)
  }

  // Production must never run scheduler ticks without a configured shared secret.
  // Headers like x-vercel-cron are spoofable and must not grant access.
  if (process.env.NODE_ENV === 'production') {
    console.error('[CRON] CRON_SECRET is not configured; rejecting scheduler request')
    return false
  }

  // Allow local manual testing without auth in development.
  return true
}

async function invokeJob(supabaseAdmin: ReturnType<typeof createAdminClient>, jobName: JobName) {
  const startedAt = Date.now()
  try {
    const { data, error } = await supabaseAdmin.functions.invoke(jobName)
    const durationMs = Date.now() - startedAt

    if (error) {
      return {
        job: jobName,
        ok: false,
        durationMs,
        error: error.message || 'Invocation failed',
      }
    }

    return {
      job: jobName,
      ok: true,
      durationMs,
      data: data ?? null,
    }
  } catch (error: unknown) {
    return {
      job: jobName,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Unexpected scheduler invoke error',
    }
  }
}

async function handleSchedulerTick(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = createAdminClient()
  const tickStartedAt = Date.now()

  const delayedExecutionsJob = await invokeJob(supabaseAdmin, 'process-scheduled-executions')
  const jobs = [delayedExecutionsJob]
  const hasFailure = !delayedExecutionsJob.ok
  const payload = {
    success: !hasFailure,
    tick: {
      startedAt: new Date(tickStartedAt).toISOString(),
      durationMs: Date.now() - tickStartedAt,
    },
    jobs,
  }

  return NextResponse.json(payload, {
    status: hasFailure ? 207 : 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(request: NextRequest) {
  return handleSchedulerTick(request)
}

export async function POST(request: NextRequest) {
  return handleSchedulerTick(request)
}
