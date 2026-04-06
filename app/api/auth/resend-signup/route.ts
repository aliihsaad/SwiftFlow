import { NextRequest, NextResponse } from "next/server"
import { assertJsonBodySize } from "@/lib/security/phase1-validation"
import { enforceRateLimit, getClientIp, normalizeRateLimitEmail, RateLimitExceededError } from "@/lib/security/rate-limit"
import { createRouteHandlerClient } from "@/utils/supabase/route"

export async function POST(request: NextRequest) {
    const response = new NextResponse(null, { status: 200 })

    try {
        assertJsonBodySize(request, 8 * 1024)
        const body = await request.json()
        const email = typeof body?.email === "string" ? normalizeRateLimitEmail(body.email) : ""
        const nextPath =
            typeof body?.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//")
                ? body.next
                : "/dashboard"

        if (!email) {
            return NextResponse.json({ ok: true }, { status: 200 })
        }

        const clientIp = getClientIp(request)
        await enforceRateLimit(
            { scope: "auth:resend-signup:ip", subject: clientIp, limit: 5, windowSeconds: 60 * 60 },
            "Too many verification email requests. Please try again later."
        )
        await enforceRateLimit(
            { scope: "auth:resend-signup:email", subject: email, limit: 4, windowSeconds: 60 * 60 },
            "Too many verification email requests. Please try again later."
        )

        const supabase = createRouteHandlerClient(request, response)
        const callbackUrl = new URL("/auth/callback", request.nextUrl.origin)
        if (nextPath !== "/dashboard") {
            callbackUrl.searchParams.set("next", nextPath)
        }

        await supabase.auth.resend({
            type: "signup",
            email,
            options: {
                emailRedirectTo: callbackUrl.toString(),
            },
        })

        return NextResponse.json({ ok: true }, { status: 200, headers: response.headers })
    } catch (error) {
        if (error instanceof RateLimitExceededError) {
            return NextResponse.json(
                { ok: false, error: error.message },
                { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
            )
        }
        if (error instanceof Error && /Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
        }
        console.error("[auth/resend-signup] unexpected error:", error)
        return NextResponse.json({ ok: true }, { status: 200 })
    }
}
