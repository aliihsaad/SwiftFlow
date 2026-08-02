import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getExplicitActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { assertJsonBodySize } from "@/lib/security/phase1-validation"
import { enforceRateLimit, getClientIp, RateLimitExceededError } from "@/lib/security/rate-limit"
import { getWorkspaceSettingsWithSecrets } from "@/lib/workspace-settings"

/**
 * POST /api/ai/validate-key
 * Tests whether an API key is valid by making a lightweight API call.
 * Body: { provider: "openrouter" | "gemini" | "openai", apiKey?: string }
 * When apiKey is omitted, the saved workspace credential is resolved server-side.
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ valid: false, error: "Unauthorized" }, { status: 401 })
        }

        const activeWorkspace = await getExplicitActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ valid: false, error: "No active workspace" }, { status: 400 })
        }

        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, "settings:write")
        assertJsonBodySize(request, 8 * 1024)
        const clientIp = getClientIp(request)
        await enforceRateLimit(
            { scope: "ai:validate-key:user", subject: `${user.id}:${activeWorkspace.id}`, limit: 10, windowSeconds: 60 * 60 },
            "Too many AI key validation attempts. Please try again later."
        )
        await enforceRateLimit(
            { scope: "ai:validate-key:ip", subject: clientIp, limit: 20, windowSeconds: 60 * 60 },
            "Too many AI key validation attempts. Please try again later."
        )

        const { provider, apiKey } = await request.json()

        if (!provider || (provider !== "openrouter" && provider !== "gemini" && provider !== "openai")) {
            return NextResponse.json({ valid: false, error: "Invalid provider." }, { status: 400 })
        }

        if (apiKey !== undefined && typeof apiKey !== "string") {
            return NextResponse.json({ valid: false, error: "API key must be a string." }, { status: 400 })
        }

        let trimmedKey = typeof apiKey === "string"
            ? apiKey.trim().replace(/^['"]|['"]$/g, "")
            : ""

        if (!trimmedKey) {
            const settings = await getWorkspaceSettingsWithSecrets(activeWorkspace.id)
            const savedKey =
                provider === "openrouter"
                    ? settings?.openrouter_api_key
                    : provider === "openai"
                        ? settings?.openai_api_key
                        : settings?.gemini_api_key
            trimmedKey = String(savedKey ?? "").trim()
        }

        if (!trimmedKey) {
            return NextResponse.json(
                { valid: false, error: "No saved API key is available for this provider." },
                { status: 400 }
            )
        }
        if (trimmedKey.length > 500) {
            return NextResponse.json({ valid: false, error: "API key is too long." }, { status: 400 })
        }

        if (provider === "openrouter") {
            if (!trimmedKey.startsWith("sk-or-v1-")) {
                return NextResponse.json({
                    valid: false,
                    error: "OpenRouter keys should start with 'sk-or-v1-'. Check that you copied the full key.",
                })
            }

            const res = await fetch("https://openrouter.ai/api/v1/key", {
                headers: { Authorization: `Bearer ${trimmedKey}` },
            })

            if (res.ok) {
                return NextResponse.json({ valid: true })
            }

            const data = await res.json().catch(() => ({}))
            const msg = data?.error?.message || `OpenRouter returned ${res.status}`
            return NextResponse.json({ valid: false, error: msg })
        }

        if (provider === "openai") {
            if (!trimmedKey.startsWith("sk-")) {
                return NextResponse.json({
                    valid: false,
                    error: "OpenAI keys should start with 'sk-'. Check that you copied the full key.",
                })
            }

            // Lightweight: list models (costs nothing)
            const res = await fetch("https://api.openai.com/v1/models?limit=1", {
                headers: { Authorization: `Bearer ${trimmedKey}` },
            })

            if (res.ok) {
                return NextResponse.json({ valid: true })
            }

            const data = await res.json().catch(() => ({}))
            const msg = data?.error?.message || `OpenAI returned ${res.status}`
            return NextResponse.json({ valid: false, error: msg })
        }

        if (!trimmedKey.startsWith("AIza")) {
            return NextResponse.json({
                valid: false,
                error: "Gemini keys should start with 'AIza...'. Check that you copied the full key from Google AI Studio.",
            })
        }

        // Lightweight: list models (free, no token usage)
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(trimmedKey)}`,
        )

        if (res.ok) {
            return NextResponse.json({ valid: true })
        }

        const data = await res.json().catch(() => ({}))
        const reason = data?.error?.status || ""
        const message = data?.error?.message || `Google returned ${res.status}`

        if (/API_KEY_INVALID/i.test(reason)) {
            return NextResponse.json({
                valid: false,
                error: "This API key is invalid. Generate a new one at Google AI Studio.",
            })
        }

        return NextResponse.json({ valid: false, error: message })
    } catch (error: unknown) {
        if (error instanceof RateLimitExceededError) {
            return NextResponse.json(
                { valid: false, error: error.message },
                { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
            )
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                { valid: false, error: error instanceof Error ? error.message : "Forbidden" },
                { status: permissionStatus }
            )
        }
        const msg = error instanceof Error ? error.message : "Validation failed"
        const status = /Request payload too large|Invalid content length/i.test(msg) ? 400 : 500
        return NextResponse.json({ valid: false, error: msg }, { status })
    }
}
