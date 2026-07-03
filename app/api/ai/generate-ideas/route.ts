import { NextRequest, NextResponse } from "next/server"
import { generateContentIdeas } from "@/lib/gemini"
import { createClient } from "@/utils/supabase/server"
import { getExplicitActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { assertJsonBodySize, sanitizePlatformList } from "@/lib/security/phase1-validation"
import { enforceRateLimit, getClientIp, RateLimitExceededError } from "@/lib/security/rate-limit"
import { redactSensitiveLogValue } from "@/lib/security/redaction"
import { gateAiGeneration } from "@/lib/billing/gate"
import { incrementWorkspaceUsage } from "@/lib/billing/usage"
import { createAdminClient } from "@/utils/supabase/admin"

const MAX_BODY_BYTES = 32 * 1024
const MAX_TOPIC_LENGTH = 500

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        assertJsonBodySize(request, MAX_BODY_BYTES)
        const body = await request.json().catch(() => null) as { topic?: unknown; platform?: unknown } | null
        const topic = typeof body?.topic === "string" ? body.topic.trim().slice(0, MAX_TOPIC_LENGTH) : ""
        const [platform] = sanitizePlatformList([body?.platform])

        if (!topic || !platform) {
            return NextResponse.json({ error: "A topic and a valid platform are required" }, { status: 400 })
        }

        const activeWorkspace = await getExplicitActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: "No valid workspace selected" }, { status: 400 })
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, "content:write")

        const clientIp = getClientIp(request)
        await enforceRateLimit(
            { scope: "ai:ideas:user", subject: `${user.id}:${activeWorkspace.id}`, limit: 30, windowSeconds: 15 * 60 },
            "Too many idea requests. Please wait a moment and try again."
        )
        await enforceRateLimit(
            { scope: "ai:ideas:ip", subject: clientIp, limit: 60, windowSeconds: 15 * 60 },
            "Too many idea requests. Please wait a moment and try again."
        )

        // Plan quota gate; BYOK workspaces (own AI key) are exempt.
        const quotaGate = await gateAiGeneration(activeWorkspace.id)
        if (quotaGate) return quotaGate

        const ideas = await generateContentIdeas(topic, platform, activeWorkspace.id)
        await incrementWorkspaceUsage(createAdminClient(), activeWorkspace.id, "ai_generations")
        return NextResponse.json({ ideas })
    } catch (error) {
        if (error instanceof RateLimitExceededError) {
            return NextResponse.json(
                { error: error.message },
                { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
            )
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : "Forbidden" },
                { status: permissionStatus }
            )
        }
        if (error instanceof Error && /Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        console.error("AI idea generation error:", redactSensitiveLogValue(error))
        return NextResponse.json({ error: "Failed to generate ideas" }, { status: 500 })
    }
}
