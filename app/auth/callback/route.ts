import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

const PASSWORD_RECOVERY_COOKIE = "password_recovery_authorized"

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const tokenHash = searchParams.get("token_hash")
    const type = searchParams.get("type")
    const nextParam = searchParams.get('next')
    const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
        ? nextParam
        : '/dashboard'

    const applyRecoveryCookie = (response: NextResponse) => {
        if (next === "/reset-password") {
            response.cookies.set(PASSWORD_RECOVERY_COOKIE, "1", {
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                path: "/",
                maxAge: 15 * 60,
            })
        }
        return response
    }

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            return applyRecoveryCookie(NextResponse.redirect(`${origin}${next}`))
        }
    }

    if (tokenHash && type === "recovery") {
        const supabase = await createClient()
        const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
        })
        if (!error) {
            return applyRecoveryCookie(NextResponse.redirect(`${origin}${next}`))
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/login?error=auth`)
}
