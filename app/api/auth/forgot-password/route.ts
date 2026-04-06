import { NextRequest, NextResponse } from "next/server"
import { assertJsonBodySize } from "@/lib/security/phase1-validation"
import { enforceRateLimit, getClientIp, normalizeRateLimitEmail, RateLimitExceededError } from "@/lib/security/rate-limit"
import { createRouteHandlerClient } from "@/utils/supabase/route"

const GENERIC_FORGOT_PASSWORD_SUCCESS = {
    ok: true,
    message: "If an account exists for that email, a reset link will be sent shortly.",
}

export async function POST(request: NextRequest) {
    const response = new NextResponse(null, { status: 200 })

    try {
        assertJsonBodySize(request, 8 * 1024)
        const body = await request.json()
        const email = typeof body?.email === "string" ? normalizeRateLimitEmail(body.email) : ""

        if (!email) {
            return NextResponse.json(GENERIC_FORGOT_PASSWORD_SUCCESS, { status: 200 })
        }

        const clientIp = getClientIp(request)
        await enforceRateLimit(
            { scope: "auth:forgot-password:ip", subject: clientIp, limit: 5, windowSeconds: 60 * 60 },
            "Too many password reset attempts. Please try again later."
        )
        await enforceRateLimit(
            { scope: "auth:forgot-password:email", subject: email, limit: 4, windowSeconds: 60 * 60 },
            "Too many password reset attempts. Please try again later."
        )

        const supabase = createRouteHandlerClient(request, response)
        const redirectTo = `${request.nextUrl.origin}/auth/callback?next=/reset-password`
        await supabase.auth.resetPasswordForEmail(email, { redirectTo })

        return NextResponse.json(GENERIC_FORGOT_PASSWORD_SUCCESS, {
            status: 200,
            headers: response.headers,
        })
    } catch (error) {
        if (error instanceof RateLimitExceededError) {
            return NextResponse.json(
                { ok: false, error: error.message },
                {
                    status: 429,
                    headers: { "Retry-After": String(error.retryAfterSeconds) },
                }
            )
        }

        if (error instanceof Error && /Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
        }

        console.error("[auth/forgot-password] unexpected error:", error)
        return NextResponse.json(GENERIC_FORGOT_PASSWORD_SUCCESS, { status: 200 })
    }
}
