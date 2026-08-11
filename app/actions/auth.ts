'use server'

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { sendPasswordChangedEmail } from "@/lib/email/send-password-changed-email"
import { cookies } from "next/headers"

const PASSWORD_RECOVERY_COOKIE = "password_recovery_authorized"
const ACTIVE_WORKSPACE_COOKIE = "active_workspace_id"

async function verifyUserPassword(password: string): Promise<{ ok: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) {
        return { ok: false, error: "Not authenticated" }
    }

    const trimmedPassword = password.trim()
    if (!trimmedPassword) {
        return { ok: false, error: "Current password is required" }
    }

    const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
            method: "POST",
            headers: {
                apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email: user.email,
                password: trimmedPassword,
            }),
            cache: "no-store",
        }
    )

    if (!response.ok) {
        return { ok: false, error: "Current password is incorrect" }
    }

    return { ok: true }
}

export async function signOut(): Promise<{ ok: true } | { ok: false; error: string }> {
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut()

    if (error) {
        console.error("[auth/sign-out] failed:", error.message)
        return { ok: false, error: "SwiftFlow could not sign you out. Please try again." }
    }

    const cookieStore = await cookies()
    cookieStore.delete(ACTIVE_WORKSPACE_COOKIE)

    return { ok: true }
}

export async function verifyCurrentPassword(password: string): Promise<{ ok: boolean; error?: string }> {
    return verifyUserPassword(password)
}

export async function updatePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) {
        return { ok: false, error: "Not authenticated" }
    }

    const passwordCheck = await verifyUserPassword(currentPassword)
    if (!passwordCheck.ok) {
        return { ok: false, error: passwordCheck.error || "Current password is incorrect" }
    }

    const supabaseAdmin = createAdminClient()
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: newPassword,
    })

    if (error) {
        return { ok: false, error: "Failed to update password" }
    }

    void sendPasswordChangedEmail({
        to: user.email,
        changedAt: new Date().toISOString(),
    }).catch((emailError) => {
        console.error("Password change email send failed", emailError)
    })

    return { ok: true }
}

export async function completePasswordRecovery(newPassword: string): Promise<{ ok: boolean; error?: string }> {
    const cookieStore = await cookies()
    const hasRecoveryAuthorization = cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value === "1"

    if (!hasRecoveryAuthorization) {
        return { ok: false, error: "Recovery session is missing or expired" }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) {
        return { ok: false, error: "Recovery session is missing or expired" }
    }

    const supabaseAdmin = createAdminClient()
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: newPassword,
    })

    if (error) {
        return { ok: false, error: "Failed to update password" }
    }

    cookieStore.set({
        name: PASSWORD_RECOVERY_COOKIE,
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
    })

    void sendPasswordChangedEmail({
        to: user.email,
        changedAt: new Date().toISOString(),
    }).catch((emailError) => {
        console.error("Password recovery email send failed", emailError)
    })

    return { ok: true }
}

export async function deleteAccount(currentPassword: string): Promise<{ ok: true } | { error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Not authenticated" }
    }

    const passwordCheck = await verifyUserPassword(currentPassword)
    if (!passwordCheck.ok) {
        return { error: passwordCheck.error || "Current password is incorrect" }
    }

    const supabaseAdmin = createAdminClient()

    // Delete workspaces the user owns (cascade handles related data)
    const { data: ownedWorkspaces, error: ownedWorkspaceError } = await supabaseAdmin
        .from("workspaces")
        .select("id")
        .eq("owner_id", user.id)

    if (ownedWorkspaceError) {
        return { error: "Failed to load owned workspaces" }
    }

    if (ownedWorkspaces && ownedWorkspaces.length > 0) {
        const ids = ownedWorkspaces.map((w) => w.id)
        const { error: memberDeleteError } = await supabaseAdmin.from("workspace_members").delete().in("workspace_id", ids)
        if (memberDeleteError) {
            return { error: "Failed to remove workspace memberships" }
        }

        const { error: workspaceDeleteError } = await supabaseAdmin.from("workspaces").delete().in("id", ids)
        if (workspaceDeleteError) {
            return { error: "Failed to delete owned workspaces" }
        }
    }

    // Remove user from workspaces they don't own
    const { error: membershipDeleteError } = await supabaseAdmin.from("workspace_members").delete().eq("user_id", user.id)
    if (membershipDeleteError) {
        return { error: "Failed to remove shared workspace memberships" }
    }

    // Delete the auth user
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id)
    if (error) {
        return { error: error.message }
    }

    // Sign out server-side so auth cookies are cleared before the client redirects.
    await supabase.auth.signOut()
    return { ok: true }
}
