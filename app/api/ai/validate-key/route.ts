import { NextRequest, NextResponse } from "next/server"

/**
 * POST /api/ai/validate-key
 * Tests whether an API key is valid by making a lightweight API call.
 * Body: { provider: "gemini" | "openai", apiKey: string }
 */
export async function POST(request: NextRequest) {
    try {
        const { provider, apiKey } = await request.json()

        if (!apiKey || typeof apiKey !== "string") {
            return NextResponse.json({ valid: false, error: "API key is required." }, { status: 400 })
        }

        const trimmedKey = apiKey.trim().replace(/^['"]|['"]$/g, "")

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

        // Default: Gemini
        if (!trimmedKey.startsWith("AIza")) {
            return NextResponse.json({
                valid: false,
                error: "Gemini keys should start with 'AIza...'. Check that you copied the full key from Google AI Studio.",
            })
        }

        // Lightweight: list models (free, no token usage)
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${trimmedKey}`,
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
        const msg = error instanceof Error ? error.message : "Validation failed"
        return NextResponse.json({ valid: false, error: msg }, { status: 500 })
    }
}
