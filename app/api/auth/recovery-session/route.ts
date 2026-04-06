import { NextResponse } from "next/server"

const PASSWORD_RECOVERY_COOKIE = "password_recovery_authorized"

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
