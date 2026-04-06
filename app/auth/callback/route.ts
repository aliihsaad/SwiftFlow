import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PASSWORD_RECOVERY_COOKIE = "password_recovery_authorized"

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const tokenHash = searchParams.get("token_hash")
    const type = searchParams.get("type")
    const nextParam = searchParams.get('next')
    const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
        ? nextParam
        : '/dashboard'

    const response = NextResponse.redirect(`${origin}${next}`)

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set(name, value, options)
                    })
                },
            },
        }
    )

    const applyRecoveryCookie = () => {
        if (next === "/reset-password") {
            response.cookies.set(PASSWORD_RECOVERY_COOKIE, "1", {
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                path: "/",
                maxAge: 15 * 60,
            })
        }
    }

    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            applyRecoveryCookie()
            return response
        }
    }

    if (tokenHash && type === "recovery") {
        const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
        })
        if (!error) {
            applyRecoveryCookie()
            return response
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/login?error=auth`)
}
