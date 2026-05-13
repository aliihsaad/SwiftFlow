"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronDown, ChevronRight, Copy, Link2, Trash2, UserMinus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import type { WorkspaceRole } from "@/types/workspace"
import type { TeamInviteRole, TeamMemberRow, WorkspaceInviteRow } from "@/types/team"
import {
    createWorkspaceInvite,
    deleteWorkspaceInviteRecord,
    removeWorkspaceMember,
    revokeWorkspaceInvite,
    updateWorkspaceMemberRole,
} from "@/app/actions/team-members"

interface TeamMembersPanelProps {
    activeWorkspace: { id: string; name: string } | null
    currentUserId: string
    activeWorkspaceRole: WorkspaceRole | null
    teamMembers: TeamMemberRow[]
    workspaceInvites: WorkspaceInviteRow[]
    inviteFeatureReady: boolean
    inviteFeatureMessage: string | null
}

const INVITE_ROLE_OPTIONS: TeamInviteRole[] = ["viewer", "editor", "admin"]

function roleLabel(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDate(value: string | null | undefined) {
    if (!value) return "—"
    return new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    })
}

function roleBadgeClass(role: WorkspaceRole) {
    if (role === "owner") return "border-amber-300/25 bg-amber-300/10 text-amber-100"
    if (role === "admin") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
    if (role === "editor") return "border-violet-300/25 bg-violet-300/10 text-violet-100"
    return "border-white/15 bg-white/5 text-white/70"
}

function statusBadgeClass(status: WorkspaceInviteRow["status"]) {
    if (status === "pending") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
    if (status === "accepted") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
    if (status === "expired") return "border-amber-300/25 bg-amber-300/10 text-amber-100"
    return "border-white/15 bg-white/5 text-white/70"
}

function isAcceptedInviteLeftWorkspace(invite: WorkspaceInviteRow, activeMemberUserIds: Set<string>) {
    return invite.status === "accepted" && !!invite.accepted_by && !activeMemberUserIds.has(invite.accepted_by)
}

function getInviteStatusLabel(invite: WorkspaceInviteRow, activeMemberUserIds: Set<string>) {
    if (isAcceptedInviteLeftWorkspace(invite, activeMemberUserIds)) {
        return "Accepted (Left Workspace)"
    }
    return roleLabel(invite.status)
}

function getInviteStatusBadgeClass(invite: WorkspaceInviteRow, activeMemberUserIds: Set<string>) {
    if (isAcceptedInviteLeftWorkspace(invite, activeMemberUserIds)) {
        return "border-amber-300/25 bg-amber-300/10 text-amber-100"
    }
    return statusBadgeClass(invite.status)
}

function getInviteHistoryDateLabel(invite: WorkspaceInviteRow) {
    if (invite.status === "accepted") {
        return invite.accepted_at ? `Accepted ${formatDate(invite.accepted_at)}` : "Accepted"
    }
    if (invite.status === "revoked") {
        return `Revoked (created ${formatDate(invite.created_at)})`
    }
    if (invite.status === "expired") {
        return `Expired ${formatDate(invite.expires_at)}`
    }
    return formatDate(invite.created_at)
}

async function copyToClipboard(value: string, successLabel: string) {
    try {
        await navigator.clipboard.writeText(value)
        toast.success(successLabel)
    } catch {
        toast.error("Failed to copy to clipboard")
    }
}

function getInviteUrl(token: string) {
    if (typeof window === "undefined") {
        return `/invite/${token}`
    }
    return `${window.location.origin}/invite/${token}`
}

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    return fallback
}

export function TeamMembersPanel({
    activeWorkspace,
    currentUserId,
    activeWorkspaceRole,
    teamMembers,
    workspaceInvites,
    inviteFeatureReady,
    inviteFeatureMessage,
}: TeamMembersPanelProps) {
    const router = useRouter()
    const canManage = activeWorkspaceRole === "owner"

    const [inviteEmail, setInviteEmail] = useState("")
    const [inviteRole, setInviteRole] = useState<TeamInviteRole>("viewer")
    const [isInviting, setIsInviting] = useState(false)
    const [busyKey, setBusyKey] = useState<string | null>(null)
    const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)
    const [memberRoleDrafts, setMemberRoleDrafts] = useState<Record<string, TeamInviteRole>>({})
    const [showInviteHistory, setShowInviteHistory] = useState(false)

    useEffect(() => {
        const nextDrafts: Record<string, TeamInviteRole> = {}
        for (const member of teamMembers) {
            if (member.role !== "owner") {
                nextDrafts[member.id] = member.role
            }
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMemberRoleDrafts(nextDrafts)
    }, [teamMembers])

    const activeMemberUserIds = new Set(teamMembers.map((member) => member.user_id))
    const pendingInvites = workspaceInvites.filter((invite) => invite.status === "pending")
    const inviteHistory = workspaceInvites.filter((invite) => invite.status !== "pending")

    const handleInviteSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!activeWorkspace || !inviteFeatureReady) return

        setIsInviting(true)
        try {
            const result = await createWorkspaceInvite(activeWorkspace.id, inviteEmail, inviteRole)
            const inviteUrl = result.inviteUrl.startsWith("/")
                ? `${window.location.origin}${result.inviteUrl}`
                : result.inviteUrl

            setLastInviteLink(inviteUrl)
            setInviteEmail("")
            if (result.emailSent) {
                await copyToClipboard(inviteUrl, "Invite email sent and link copied")
            } else {
                if (result.emailError) {
                    console.warn("Automatic invite email failed", result.emailError)
                }
                toast.error("Invite created, but automatic email could not be sent. Share the copied link manually.")
                await copyToClipboard(inviteUrl, "Invite link copied (share manually)")
            }
            router.refresh()
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to create invite"))
        } finally {
            setIsInviting(false)
        }
    }

    const handleSaveRole = async (member: TeamMemberRow) => {
        if (!activeWorkspace) return

        const nextRole = memberRoleDrafts[member.id]
        if (!nextRole || nextRole === member.role) return

        setBusyKey(`role:${member.id}`)
        try {
            await updateWorkspaceMemberRole(activeWorkspace.id, member.id, nextRole)
            toast.success("Member role updated")
            router.refresh()
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to update role"))
        } finally {
            setBusyKey(null)
        }
    }

    const handleRemoveMember = async (member: TeamMemberRow) => {
        if (!activeWorkspace) return
        const label = member.email || member.display_name || member.user_id
        const confirmed = window.confirm(`Remove ${label} from ${activeWorkspace.name}?`)
        if (!confirmed) return

        setBusyKey(`remove:${member.id}`)
        try {
            await removeWorkspaceMember(activeWorkspace.id, member.id)
            toast.success("Member removed")
            router.refresh()
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to remove member"))
        } finally {
            setBusyKey(null)
        }
    }

    const handleRevokeInvite = async (invite: WorkspaceInviteRow) => {
        if (!activeWorkspace) return
        const confirmed = window.confirm(`Revoke invite for ${invite.email}?`)
        if (!confirmed) return

        setBusyKey(`invite:${invite.id}`)
        try {
            await revokeWorkspaceInvite(activeWorkspace.id, invite.id)
            toast.success("Invite revoked")
            router.refresh()
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to revoke invite"))
        } finally {
            setBusyKey(null)
        }
    }

    const handleDeleteInviteRecord = async (invite: WorkspaceInviteRow) => {
        if (!activeWorkspace) return
        const confirmed = window.confirm(`Delete invite record for ${invite.email}? This removes the invite from history.`)
        if (!confirmed) return

        setBusyKey(`invite-delete:${invite.id}`)
        try {
            await deleteWorkspaceInviteRecord(activeWorkspace.id, invite.id)
            toast.success("Invite record deleted")
            router.refresh()
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to delete invite record"))
        } finally {
            setBusyKey(null)
        }
    }

    if (!activeWorkspace) {
        return (
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">
                No active workspace selected. Switch to a workspace to manage team members.
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#1b1d28] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm text-white/75">
                        <Users className="h-4 w-4 text-cyan-200/80" />
                        <span className="truncate">Active workspace: {activeWorkspace.name}</span>
                    </div>
                    <p className="mt-1 text-xs text-white/45">
                        {canManage
                            ? "You can invite members, change roles, and revoke access."
                            : "Only the workspace owner can invite members and manage access."}
                    </p>
                </div>
                <Badge className={`border ${roleBadgeClass(activeWorkspaceRole || "viewer")}`}>
                    {roleLabel(activeWorkspaceRole || "viewer")}
                </Badge>
            </div>

            {inviteFeatureMessage && (
                <div className="rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100/90">
                    {inviteFeatureMessage}
                </div>
            )}

            {canManage && inviteFeatureReady && (
                <form onSubmit={handleInviteSubmit} className="space-y-3 rounded-xl border border-white/10 bg-[#1b1d28] p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-white/85">
                        <Link2 className="h-4 w-4 text-cyan-200/80" />
                        Create Invite Link
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto] md:items-end">
                        <div className="space-y-2">
                            <Label htmlFor="invite-email" className="text-white/70">Teammate Email</Label>
                            <Input
                                id="invite-email"
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder="teammate@company.com"
                                required
                                disabled={isInviting}
                                className="border-white/10 bg-[#151620] text-white/85 placeholder:text-white/30"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-white/70">Role</Label>
                            <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as TeamInviteRole)}>
                                <SelectTrigger className="w-full border-white/10 bg-[#151620] text-white/85">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-white/10 bg-[#1b1d28] text-white/85">
                                    {INVITE_ROLE_OPTIONS.map((role) => (
                                        <SelectItem key={role} value={role} className="focus:bg-white/10 focus:text-white">
                                            {roleLabel(role)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            type="submit"
                            disabled={isInviting || !inviteEmail.trim()}
                            className="border border-cyan-300/20 bg-gradient-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
                        >
                            {isInviting ? "Creating..." : "Create Invite"}
                        </Button>
                    </div>
                    <p className="text-xs text-white/45">
                        Sends an invite email and creates a shareable link (7-day expiry). The teammate must sign up or sign in with the same invited email address to accept.
                    </p>
                    {lastInviteLink && (
                        <div className="space-y-2 rounded-lg border border-white/10 bg-[#151620] p-3">
                            <div className="text-xs font-medium uppercase tracking-[0.08em] text-white/45">Latest Invite Link</div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Input
                                    readOnly
                                    value={lastInviteLink}
                                    className="border-white/10 bg-black/20 text-white/75"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => copyToClipboard(lastInviteLink, "Invite link copied")}
                                    className="border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                                >
                                    <Copy className="h-4 w-4" />
                                    Copy
                                </Button>
                            </div>
                        </div>
                    )}
                </form>
            )}

            <div className="space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <h4 className="text-sm font-semibold tracking-wide text-white/85">Current Members</h4>
                    <span className="text-xs text-white/45">{teamMembers.length} total</span>
                </div>
                <div className="overflow-hidden rounded-xl border border-white/10 bg-[#151620]">
                    <Table className="min-w-[760px]">
                        <TableHeader>
                            <TableRow className="border-white/10 hover:bg-transparent">
                                <TableHead className="text-white/45">Member</TableHead>
                                <TableHead className="text-white/45">Role</TableHead>
                                <TableHead className="text-white/45">Joined</TableHead>
                                <TableHead className="text-right text-white/45">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {teamMembers.length === 0 ? (
                                <TableRow className="border-white/5">
                                    <TableCell colSpan={4} className="py-8 text-center text-sm text-white/50">
                                        No members found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                teamMembers.map((member) => {
                                    const isOwner = member.role === "owner"
                                    const isSelf = member.user_id === currentUserId
                                    const roleDraft = memberRoleDrafts[member.id]
                                    const roleChanged = !isOwner && !!roleDraft && roleDraft !== member.role
                                    const isRowBusy = busyKey === `role:${member.id}` || busyKey === `remove:${member.id}`

                                    return (
                                        <TableRow key={member.id} className="border-white/5 hover:bg-white/5">
                                            <TableCell className="align-top">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="max-w-[220px] truncate font-medium text-white/85">
                                                            {member.display_name || member.email || "Workspace Member"}
                                                        </span>
                                                        {isSelf && (
                                                            <Badge className="border-white/15 bg-white/5 text-[10px] text-white/70">
                                                                You
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <span className="max-w-[260px] truncate text-xs text-white/50">
                                                        {member.email || member.user_id}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="align-top">
                                                {isOwner ? (
                                                    <Badge className={`border ${roleBadgeClass(member.role)}`}>
                                                        {roleLabel(member.role)}
                                                    </Badge>
                                                ) : canManage ? (
                                                    <Select
                                                        value={roleDraft || "viewer"}
                                                        onValueChange={(value) =>
                                                            setMemberRoleDrafts((prev) => ({ ...prev, [member.id]: value as TeamInviteRole }))
                                                        }
                                                        disabled={isRowBusy}
                                                    >
                                                        <SelectTrigger className="w-[132px] border-white/10 bg-[#1b1d28] text-white/80">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="border-white/10 bg-[#1b1d28] text-white/85">
                                                            {INVITE_ROLE_OPTIONS.map((role) => (
                                                                <SelectItem key={role} value={role} className="focus:bg-white/10 focus:text-white">
                                                                    {roleLabel(role)}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <Badge className={`border ${roleBadgeClass(member.role)}`}>
                                                        {roleLabel(member.role)}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="align-top text-white/55">
                                                {formatDate(member.created_at)}
                                            </TableCell>
                                            <TableCell className="align-top">
                                                <div className="flex justify-end gap-2">
                                                    {canManage && !isOwner && (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={!roleChanged || isRowBusy}
                                                            onClick={() => handleSaveRole(member)}
                                                            className="border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                                                        >
                                                            {busyKey === `role:${member.id}` ? "Saving..." : "Save"}
                                                        </Button>
                                                    )}
                                                    {canManage && !isOwner && !isSelf && (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={isRowBusy}
                                                            onClick={() => handleRemoveMember(member)}
                                                            className="border-red-400/20 bg-red-500/10 text-red-200 hover:bg-red-500/15 hover:text-red-100"
                                                        >
                                                            <UserMinus className="h-4 w-4" />
                                                            {busyKey === `remove:${member.id}` ? "Removing..." : "Remove"}
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <h4 className="text-sm font-semibold tracking-wide text-white/85">Invites</h4>
                    <span className="text-xs text-white/45">
                        {pendingInvites.length} pending{inviteHistory.length ? ` • ${inviteHistory.length} history` : ""}
                    </span>
                </div>

                {!inviteFeatureReady ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/50">
                        Invites are unavailable until the database migration is applied.
                    </div>
                ) : !canManage ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/50">
                        Only the workspace owner can view and manage invite links.
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#151620]">
                            <Table className="min-w-[820px]">
                                <TableHeader>
                                    <TableRow className="border-white/10 hover:bg-transparent">
                                        <TableHead className="text-white/45">Email</TableHead>
                                        <TableHead className="text-white/45">Role</TableHead>
                                        <TableHead className="text-white/45">Status</TableHead>
                                        <TableHead className="text-white/45">Expires</TableHead>
                                        <TableHead className="text-right text-white/45">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pendingInvites.length === 0 ? (
                                        <TableRow className="border-white/5">
                                            <TableCell colSpan={5} className="py-8 text-center text-sm text-white/50">
                                                No pending invites.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        pendingInvites.map((invite) => {
                                            const rowBusy = busyKey === `invite:${invite.id}`
                                            const inviteUrl = getInviteUrl(invite.token)

                                            return (
                                                <TableRow key={invite.id} className="border-white/5 hover:bg-white/5">
                                                    <TableCell className="max-w-[240px] truncate font-medium text-white/85">{invite.email}</TableCell>
                                                    <TableCell>
                                                        <Badge className={`border ${roleBadgeClass(invite.role)}`}>
                                                            {roleLabel(invite.role)}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge className={`border ${statusBadgeClass(invite.status)}`}>
                                                            {roleLabel(invite.status)}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-white/55">{formatDate(invite.expires_at)}</TableCell>
                                                    <TableCell>
                                                        <div className="flex justify-end gap-2">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => copyToClipboard(inviteUrl, "Invite link copied")}
                                                                className="border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                                                            >
                                                                <Copy className="h-4 w-4" />
                                                                Copy
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                disabled={rowBusy}
                                                                onClick={() => handleRevokeInvite(invite)}
                                                                className="border-red-400/20 bg-red-500/10 text-red-200 hover:bg-red-500/15 hover:text-red-100"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                                {rowBusy ? "Revoking..." : "Revoke"}
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {inviteHistory.length > 0 && (
                            <div className="rounded-xl border border-white/10 bg-[#151620]">
                                <button
                                    type="button"
                                    onClick={() => setShowInviteHistory((prev) => !prev)}
                                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                                >
                                    <div className="flex items-center gap-2">
                                        {showInviteHistory ? (
                                            <ChevronDown className="h-4 w-4 text-white/55" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 text-white/55" />
                                        )}
                                        <span className="text-sm font-medium text-white/80">Invite History</span>
                                    </div>
                                    <span className="text-xs text-white/45">{inviteHistory.length} records</span>
                                </button>

                                {showInviteHistory && (
                                    <div className="border-t border-white/10">
                                        <Table className="min-w-[820px]">
                                            <TableHeader>
                                                <TableRow className="border-white/10 hover:bg-transparent">
                                                    <TableHead className="text-white/45">Email</TableHead>
                                                    <TableHead className="text-white/45">Role</TableHead>
                                                    <TableHead className="text-white/45">Status</TableHead>
                                                    <TableHead className="text-white/45">History</TableHead>
                                                    <TableHead className="text-right text-white/45">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {inviteHistory.map((invite) => {
                                                    const rowBusy = busyKey === `invite-delete:${invite.id}`
                                                    const statusLabel = getInviteStatusLabel(invite, activeMemberUserIds)
                                                    const statusClass = getInviteStatusBadgeClass(invite, activeMemberUserIds)

                                                    return (
                                                        <TableRow key={invite.id} className="border-white/5 hover:bg-white/5">
                                                            <TableCell className="align-top">
                                                                <div className="max-w-[240px] truncate font-medium text-white/85">{invite.email}</div>
                                                                <div className="mt-1 text-xs text-white/45">
                                                                    Created {formatDate(invite.created_at)}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="align-top">
                                                                <Badge className={`border ${roleBadgeClass(invite.role)}`}>
                                                                    {roleLabel(invite.role)}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="align-top">
                                                                <Badge className={`border ${statusClass}`}>
                                                                    {statusLabel}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="align-top text-white/55">
                                                                {getInviteHistoryDateLabel(invite)}
                                                            </TableCell>
                                                            <TableCell className="align-top">
                                                                <div className="flex justify-end gap-2">
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        disabled={rowBusy}
                                                                        onClick={() => handleDeleteInviteRecord(invite)}
                                                                        className="border-red-400/20 bg-red-500/10 text-red-200 hover:bg-red-500/15 hover:text-red-100"
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                        {rowBusy ? "Deleting..." : "Delete"}
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                )}
            </div>
        </div>
    )
}
