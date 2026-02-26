"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { sendWorkspaceInviteEmail } from "@/lib/email/send-workspace-invite-email"
import type { WorkspaceRole } from "@/types/workspace"
import type { TeamInviteRole } from "@/types/team"

type ManageRole = Extract<WorkspaceRole, "owner">

type InvitePreview = {
    id: string
    workspace_id: string
    workspace_name: string
    email: string
    role: TeamInviteRole
    status: "pending" | "accepted" | "revoked" | "expired"
    expires_at: string
    accepted_at: string | null
    accepted_by: string | null
    created_at: string
    is_expired: boolean
}

function isInviteRole(value: string): value is TeamInviteRole {
    return value === "admin" || value === "editor" || value === "viewer"
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase()
}

function assertValidEmail(email: string) {
    const normalized = normalizeEmail(email)
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!emailPattern.test(normalized)) {
        throw new Error("Enter a valid email address")
    }

    return normalized
}

function generateInviteToken() {
    return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`
}

async function getAuthenticatedUser() {
    const supabase = await createClient()
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user) {
        throw new Error("Unauthorized")
    }

    return { supabase, user }
}

async function requireWorkspaceManageRole(workspaceId: string, allowedRoles: ManageRole[] = ["owner"]) {
    const { supabase, user } = await getAuthenticatedUser()

    const { data: membership, error } = await supabase
        .from("workspace_members")
        .select("id, role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle()

    if (error) {
        throw new Error(`Failed to validate workspace access: ${error.message}`)
    }

    if (!membership) {
        throw new Error("You are not a member of this workspace")
    }

    if (!allowedRoles.includes(membership.role as ManageRole)) {
        throw new Error("Only workspace owners can manage team members")
    }

    return { supabase, user, membershipRole: membership.role as WorkspaceRole }
}

async function getInviteRecordByToken(token: string) {
    const safeToken = token.trim()
    if (!safeToken) return null

    const supabaseAdmin = createAdminClient()
    const { data, error } = await supabaseAdmin
        .from("workspace_invites")
        .select(`
            id,
            workspace_id,
            email,
            role,
            status,
            expires_at,
            accepted_at,
            accepted_by,
            created_at,
            workspaces!workspace_invites_workspace_id_fkey (
                id,
                name
            )
        `)
        .eq("token", safeToken)
        .maybeSingle()

    if (error) {
        throw new Error(`Failed to load invite: ${error.message}`)
    }

    if (!data) return null

    const workspace = Array.isArray(data.workspaces) ? data.workspaces[0] : data.workspaces
    const expiresAt = new Date(data.expires_at)

    return {
        id: data.id as string,
        workspace_id: data.workspace_id as string,
        workspace_name: (workspace?.name as string | undefined) || "Workspace",
        email: data.email as string,
        role: data.role as TeamInviteRole,
        status: data.status as InvitePreview["status"],
        expires_at: data.expires_at as string,
        accepted_at: (data.accepted_at as string | null) ?? null,
        accepted_by: (data.accepted_by as string | null) ?? null,
        created_at: data.created_at as string,
        is_expired: expiresAt.getTime() <= Date.now(),
    } satisfies InvitePreview
}

export async function getWorkspaceInvitePreview(token: string): Promise<InvitePreview | null> {
    return getInviteRecordByToken(token)
}

export async function createWorkspaceInvite(workspaceId: string, email: string, role: TeamInviteRole) {
    if (!workspaceId) throw new Error("Missing workspace ID")
    if (!isInviteRole(role)) throw new Error("Invalid invite role")

    const normalizedEmail = assertValidEmail(email)
    const { user } = await requireWorkspaceManageRole(workspaceId, ["owner"])
    const supabaseAdmin = createAdminClient()

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const token = generateInviteToken()

    // Avoid multiple active invites for the same email in the same workspace.
    await supabaseAdmin
        .from("workspace_invites")
        .update({ status: "revoked" })
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .ilike("email", normalizedEmail)

    const { error } = await supabaseAdmin
        .from("workspace_invites")
        .insert({
            workspace_id: workspaceId,
            email: normalizedEmail,
            role,
            invited_by: user.id,
            token,
            status: "pending",
            expires_at: expiresAt,
        })

    if (error) {
        throw new Error(`Failed to create invite: ${error.message}`)
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
    const inviteUrl = appUrl ? `${appUrl}/invite/${token}` : `/invite/${token}`

    let workspaceName = "Workspace"
    try {
        const { data: workspaceRow } = await supabaseAdmin
            .from("workspaces")
            .select("name")
            .eq("id", workspaceId)
            .maybeSingle()

        if (workspaceRow?.name && typeof workspaceRow.name === "string") {
            workspaceName = workspaceRow.name
        }
    } catch (workspaceLookupError) {
        console.warn("Failed to load workspace name for invite email", workspaceLookupError)
    }

    let emailSent = false
    let emailError: string | null = null
    let emailProviderId: string | null = null

    try {
        const result = await sendWorkspaceInviteEmail({
            to: normalizedEmail,
            workspaceName,
            inviterEmail: user.email ?? null,
            role,
            inviteUrl,
            expiresAt,
        })
        emailSent = true
        emailProviderId = result.id
    } catch (sendError) {
        emailError = sendError instanceof Error ? sendError.message : "Unknown email send error"
        console.error("Workspace invite email send failed", {
            workspaceId,
            email: normalizedEmail,
            error: emailError,
        })
    }

    revalidatePath("/dashboard/settings")

    return {
        token,
        inviteUrl,
        expiresAt,
        emailSent,
        emailError,
        emailProviderId,
    }
}

export async function revokeWorkspaceInvite(workspaceId: string, inviteId: string) {
    if (!workspaceId || !inviteId) throw new Error("Missing invite details")

    await requireWorkspaceManageRole(workspaceId, ["owner"])
    const supabaseAdmin = createAdminClient()

    const { data, error } = await supabaseAdmin
        .from("workspace_invites")
        .update({ status: "revoked" })
        .eq("id", inviteId)
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle()

    if (error) {
        throw new Error(`Failed to revoke invite: ${error.message}`)
    }

    if (!data) {
        throw new Error("Invite not found or no longer pending")
    }

    revalidatePath("/dashboard/settings")
}

export async function deleteWorkspaceInviteRecord(workspaceId: string, inviteId: string) {
    if (!workspaceId || !inviteId) throw new Error("Missing invite details")

    await requireWorkspaceManageRole(workspaceId, ["owner"])
    const supabaseAdmin = createAdminClient()

    const { data: invite, error: inviteError } = await supabaseAdmin
        .from("workspace_invites")
        .select("id, status")
        .eq("id", inviteId)
        .eq("workspace_id", workspaceId)
        .maybeSingle()

    if (inviteError) {
        throw new Error(`Failed to load invite: ${inviteError.message}`)
    }

    if (!invite) {
        throw new Error("Invite not found")
    }

    if ((invite.status as string) === "pending") {
        throw new Error("Pending invites should be revoked instead of deleted")
    }

    const { error } = await supabaseAdmin
        .from("workspace_invites")
        .delete()
        .eq("id", inviteId)
        .eq("workspace_id", workspaceId)

    if (error) {
        throw new Error(`Failed to delete invite record: ${error.message}`)
    }

    revalidatePath("/dashboard/settings")
}

export async function updateWorkspaceMemberRole(workspaceId: string, memberId: string, role: TeamInviteRole) {
    if (!workspaceId || !memberId) throw new Error("Missing member details")
    if (!isInviteRole(role)) throw new Error("Invalid role")

    const { user } = await requireWorkspaceManageRole(workspaceId, ["owner"])
    const supabaseAdmin = createAdminClient()

    const { data: target, error: targetError } = await supabaseAdmin
        .from("workspace_members")
        .select("id, user_id, role")
        .eq("id", memberId)
        .eq("workspace_id", workspaceId)
        .maybeSingle()

    if (targetError) {
        throw new Error(`Failed to load member: ${targetError.message}`)
    }

    if (!target) {
        throw new Error("Member not found")
    }

    if ((target.role as WorkspaceRole) === "owner") {
        throw new Error("Owner role cannot be changed here")
    }

    if ((target.user_id as string) === user.id) {
        throw new Error("You cannot change your own role")
    }

    const { error } = await supabaseAdmin
        .from("workspace_members")
        .update({ role })
        .eq("id", memberId)
        .eq("workspace_id", workspaceId)

    if (error) {
        throw new Error(`Failed to update member role: ${error.message}`)
    }

    revalidatePath("/dashboard/settings")
}

export async function removeWorkspaceMember(workspaceId: string, memberId: string) {
    if (!workspaceId || !memberId) throw new Error("Missing member details")

    const { user } = await requireWorkspaceManageRole(workspaceId, ["owner"])
    const supabaseAdmin = createAdminClient()

    const { data: target, error: targetError } = await supabaseAdmin
        .from("workspace_members")
        .select("id, user_id, role")
        .eq("id", memberId)
        .eq("workspace_id", workspaceId)
        .maybeSingle()

    if (targetError) {
        throw new Error(`Failed to load member: ${targetError.message}`)
    }

    if (!target) {
        throw new Error("Member not found")
    }

    if ((target.role as WorkspaceRole) === "owner") {
        throw new Error("Workspace owner cannot be removed")
    }

    if ((target.user_id as string) === user.id) {
        throw new Error("Use Leave Workspace instead to remove yourself")
    }

    const { error } = await supabaseAdmin
        .from("workspace_members")
        .delete()
        .eq("id", memberId)
        .eq("workspace_id", workspaceId)

    if (error) {
        throw new Error(`Failed to remove member: ${error.message}`)
    }

    revalidatePath("/dashboard/settings")
}

export async function acceptWorkspaceInvite(token: string) {
    const { user } = await getAuthenticatedUser()
    const userEmail = normalizeEmail(user.email || "")

    if (!userEmail) {
        throw new Error("Your account is missing an email address")
    }

    const invite = await getInviteRecordByToken(token)
    if (!invite) {
        throw new Error("Invite not found")
    }

    const supabaseAdmin = createAdminClient()

    if (invite.status !== "pending") {
        if (invite.status === "accepted" && invite.accepted_by === user.id) {
            const cookieStore = await cookies()
            cookieStore.set("active_workspace_id", invite.workspace_id, {
                path: "/",
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
            })
            return { workspaceId: invite.workspace_id, workspaceName: invite.workspace_name, alreadyAccepted: true }
        }
        throw new Error(`This invite is ${invite.status}`)
    }

    if (invite.is_expired) {
        await supabaseAdmin
            .from("workspace_invites")
            .update({ status: "expired" })
            .eq("id", invite.id)
            .eq("status", "pending")

        throw new Error("This invite has expired")
    }

    if (normalizeEmail(invite.email) !== userEmail) {
        throw new Error(`Sign in with ${invite.email} to accept this invite`)
    }

    const { data: existingMembership, error: membershipLookupError } = await supabaseAdmin
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", invite.workspace_id)
        .eq("user_id", user.id)
        .maybeSingle()

    if (membershipLookupError) {
        throw new Error(`Failed to validate membership: ${membershipLookupError.message}`)
    }

    if (!existingMembership) {
        const { error: memberInsertError } = await supabaseAdmin
            .from("workspace_members")
            .insert({
                workspace_id: invite.workspace_id,
                user_id: user.id,
                role: invite.role,
            })

        if (memberInsertError && memberInsertError.code !== "23505") {
            throw new Error(`Failed to join workspace: ${memberInsertError.message}`)
        }
    }

    const { error: acceptError } = await supabaseAdmin
        .from("workspace_invites")
        .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
            accepted_by: user.id,
        })
        .eq("id", invite.id)
        .eq("status", "pending")

    if (acceptError) {
        throw new Error(`Failed to finalize invite: ${acceptError.message}`)
    }

    const cookieStore = await cookies()
    cookieStore.set("active_workspace_id", invite.workspace_id, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
    })

    revalidatePath("/dashboard")
    revalidatePath("/dashboard/settings")

    return { workspaceId: invite.workspace_id, workspaceName: invite.workspace_name, alreadyAccepted: false }
}
