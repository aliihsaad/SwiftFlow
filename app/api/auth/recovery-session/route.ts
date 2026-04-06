import { NextResponse } from "next/server"
import { cookies } from "next/headers"

const PASSWORD_RECOVERY_COOKIE = "password_recovery_authorized"

export async function GET() {
    const cookieStore = await cookies()
    const authorized = cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value === "1"
    return NextResponse.json({ authorized })
}

export async function DELETE() {
    const response = NextResponse.json({ ok: true })
    response.cookies.set(PASSWORD_RECOVERY_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
    })
    return response
}
