import { NextRequest, NextResponse } from 'next/server'
import { assertJsonBodySize, sanitizeAssistantInvokePayload } from '@/lib/security/phase1-validation'
import { enforceRateLimit, getClientIp, RateLimitExceededError } from '@/lib/security/rate-limit'
import { redactSensitiveLogValue } from '@/lib/security/redaction'
import { AssistantAuthError, resolveAssistantWorkspace } from '@/lib/assistant/auth'
import { assertAssistantEdgeFunctionName, invokeAssistantEdgeFunction } from '@/lib/assistant/edge-invoke'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
    try {
        assertJsonBodySize(request)
        const payload = await request.json()
        const body = payload?.body

        let functionName
        try {
            functionName = assertAssistantEdgeFunctionName(payload?.functionName)
        } catch (error) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Invalid function' },
                { status: 400 },
            )
        }

        const workspace = await resolveAssistantWorkspace(request, body?.workspaceId)

        const invokeBody = {
            ...sanitizeAssistantInvokePayload(functionName, body || {}),
            workspaceId: workspace.workspaceId,
        }

        const clientIp = getClientIp(request)
        await enforceRateLimit(
            { scope: `assistant:${functionName}:user`, subject: `${workspace.userId}:${workspace.workspaceId}`, limit: 30, windowSeconds: 15 * 60 },
            'Too many AI requests. Please wait a moment and try again.'
        )
        await enforceRateLimit(
            { scope: `assistant:${functionName}:ip`, subject: clientIp, limit: 60, windowSeconds: 15 * 60 },
            'Too many AI requests. Please wait a moment and try again.'
        )

        const edgeResult = await invokeAssistantEdgeFunction(functionName, invokeBody)

        if (!edgeResult.ok) {
            const errorPayload = edgeResult.payload && typeof edgeResult.payload === 'object'
                ? edgeResult.payload as { error?: unknown }
                : {}
            const details = typeof errorPayload.error === 'string'
                ? errorPayload.error
                : `Edge function ${functionName} failed`
            console.error(`[assistant/invoke] ${functionName} non-2xx:`, edgeResult.status, details)
            return NextResponse.json(
                { error: details },
                { status: edgeResult.status >= 400 ? edgeResult.status : 502 }
            )
        }

        return NextResponse.json({ data: edgeResult.payload }, { status: 200 })
    } catch (error: unknown) {
        if (error instanceof RateLimitExceededError) {
            return NextResponse.json(
                { error: error.message },
                { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } }
            )
        }
        if (error instanceof AssistantAuthError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.status }
            )
        }
        if (error instanceof Error && /Invalid assistant payload|Invalid workspaceId|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json(
                { error: error.message },
                { status: 400 }
            )
        }
        console.error('[assistant/invoke] unexpected error:', redactSensitiveLogValue(error))
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        )
    }
}
