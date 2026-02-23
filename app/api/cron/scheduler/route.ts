import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

type JobName = 'process-scheduled-posts' | 'process-scheduled-executions'

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const vercelCronHeader = request.headers.get('x-vercel-cron')

  // Preferred: shared secret (works for Vercel Cron if CRON_SECRET is configured).
  if (cronSecret) {
    return authHeader === `Bearer ${cronSecret}`
  }

  // Fallback for projects not yet using CRON_SECRET.
  if (vercelCronHeader) return true

  // Allow local manual testing without auth in development.
  return process.env.NODE_ENV !== 'production'
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
  } catch (error: any) {
    return {
      job: jobName,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error?.message || 'Unexpected scheduler invoke error',
    }
  }
}

async function handleSchedulerTick(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = createAdminClient()
  const tickStartedAt = Date.now()

  const [postsJob, delayedExecutionsJob] = await Promise.all([
    invokeJob(supabaseAdmin, 'process-scheduled-posts'),
    invokeJob(supabaseAdmin, 'process-scheduled-executions'),
  ])

  const jobs = [postsJob, delayedExecutionsJob]
  const hasFailure = jobs.some((job) => !job.ok)

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

