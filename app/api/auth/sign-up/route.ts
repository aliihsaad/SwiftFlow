import { NextRequest, NextResponse } from "next/server"
import { assertJsonBodySize } from "@/lib/security/phase1-validation"
import { enforceRateLimit, getClientIp, normalizeRateLimitEmail, RateLimitExceededError } from "@/lib/security/rate-limit"
import { createRouteHandlerClient } from "@/utils/supabase/route"

const GENERIC_SIGNUP_ERROR = "Sign up could not be completed. If the email can be used, you will receive the next step by email."

function getSafeNextPath(rawNext: unknown): string {
    if (typeof rawNext !== "string") return "/dashboard"
    if (!rawNext.startsWith("/") || rawNext.startsWith("//")) return "/dashboard"
    return rawNext
}

export async function POST(request: NextRequest) {
    const response = new NextResponse(null, { status: 200 })

    try {
        assertJsonBodySize(request, 16 * 1024)
        const body = await request.json()
        const email = typeof body?.email === "string" ? normalizeRateLimitEmail(body.email) : ""
        const password = typeof body?.password === "string" ? body.password : ""
        const nextPath = getSafeNextPath(body?.next)

        if (!email || !password) {
            return NextResponse.json({ error: GENERIC_SIGNUP_ERROR }, { status: 400 })
        }

        const clientIp = getClientIp(request)
        await enforceRateLimit(
            { scope: "auth:sign-up:ip", subject: clientIp, limit: 6, windowSeconds: 60 * 60 },
            "Too many sign-up attempts. Please try again later."
        )
        await enforceRateLimit(
            { scope: "auth:sign-up:email", subject: email, limit: 4, windowSeconds: 60 * 60 },
            "Too many sign-up attempts. Please try again later."
        )

        const supabase = createRouteHandlerClient(request, response)
        const callbackUrl = new URL("/auth/callback", request.nextUrl.origin)
        if (nextPath !== "/dashboard") {
            callbackUrl.searchParams.set("next", nextPath)
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: callbackUrl.toString(),
            },
        })

        if (error) {
            return NextResponse.json({ error: GENERIC_SIGNUP_ERROR }, { status: 400 })
        }

        response.headers.set("Content-Type", "application/json")
        response.headers.set("x-auth-session-created", data.session ? "1" : "0")
        response.headers.set("x-auth-email-confirmation", data.session ? "0" : "1")
        return new NextResponse(JSON.stringify({
            ok: true,
            sessionCreated: Boolean(data.session),
            needsEmailConfirmation: !data.session,
        }), {
            status: 200,
            headers: response.headers,
        })
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

        console.error("[auth/sign-up] unexpected error:", error)
        return NextResponse.json({ error: GENERIC_SIGNUP_ERROR }, { status: 500 })
    }
}
