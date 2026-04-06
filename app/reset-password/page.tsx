import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"

const PASSWORD_RECOVERY_COOKIE = "password_recovery_authorized"

export default async function ResetPasswordPage() {
    const cookieStore = await cookies()
    const hasRecoveryCookie = cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value === "1"

    if (!hasRecoveryCookie) {
        redirect("/login")
    }

    return <ResetPasswordForm />
}
