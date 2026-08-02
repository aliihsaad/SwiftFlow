import { NextRequest, NextResponse } from "next/server"
import { assertJsonBodySize } from "@/lib/security/phase1-validation"
import { enforceRateLimit, getClientIp, normalizeRateLimitEmail, RateLimitExceededError } from "@/lib/security/rate-limit"
import { createRouteHandlerClient } from "@/utils/supabase/route"

const GENERIC_SIGNIN_ERROR = "Sign in failed. Check your credentials and try again."

export async function POST(request: NextRequest) {
    const response = NextResponse.json({ ok: true }, { status: 200 })

    try {
        assertJsonBodySize(request, 16 * 1024)
        const body = await request.json()
        const email = typeof body?.email === "string" ? normalizeRateLimitEmail(body.email) : ""
        const password = typeof body?.password === "string" ? body.password : ""

        if (!email || !password) {
            return NextResponse.json({ error: GENERIC_SIGNIN_ERROR }, { status: 400 })
        }

        const clientIp = getClientIp(request)
        await enforceRateLimit(
            { scope: "auth:sign-in:ip", subject: clientIp, limit: 10, windowSeconds: 15 * 60 },
            "Too many sign-in attempts. Please try again shortly."
        )
        await enforceRateLimit(
            { scope: "auth:sign-in:email", subject: email, limit: 8, windowSeconds: 15 * 60 },
            "Too many sign-in attempts. Please try again shortly."
        )

        const supabase = createRouteHandlerClient(request, response)
        const { error } = await supabase.auth.signInWithPassword({ email, password })

        if (error) {
            return NextResponse.json({ error: GENERIC_SIGNIN_ERROR }, { status: 400 })
        }

        return response
    } catch (error) {
        if (error instanceof RateLimitExceededError) {
            return NextResponse.json(
                { error: error.message },
                {
                    status: 429,
                    headers: { "Retry-After": String(error.retryAfterSeconds) },
                }
            )
        }

        if (error instanceof Error && /Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }

        console.error("[auth/sign-in] unexpected error:", error)
        return NextResponse.json({ error: GENERIC_SIGNIN_ERROR }, { status: 500 })
    }
}
