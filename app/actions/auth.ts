'use server'

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { redirect } from "next/navigation"

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

export async function signOut() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/')
}

export async function verifyCurrentPassword(password: string): Promise<{ ok: boolean; error?: string }> {
    return verifyUserPassword(password)
}

export async function deleteAccount(currentPassword: string): Promise<{ error: string } | never> {
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

    // Sign out and redirect
    await supabase.auth.signOut()
    redirect("/login")
}
