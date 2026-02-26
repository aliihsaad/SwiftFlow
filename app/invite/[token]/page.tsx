import Link from "next/link"
import { redirect } from "next/navigation"
import { Mail, Shield, Users } from "lucide-react"
import { createClient } from "@/utils/supabase/server"
import { acceptWorkspaceInvite, getWorkspaceInvitePreview } from "@/app/actions/team-members"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AcceptInviteSubmit } from "@/components/invite/accept-invite-submit"

function formatDate(value: string) {
    return new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    })
}

function roleBadgeClass(role: string) {
    if (role === "admin") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
    if (role === "editor") return "border-violet-300/25 bg-violet-300/10 text-violet-100"
    return "border-white/15 bg-white/5 text-white/75"
}

function statusBadgeClass(status: string) {
    if (status === "pending") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
    if (status === "accepted") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
    if (status === "expired") return "border-amber-300/25 bg-amber-300/10 text-amber-100"
    return "border-white/15 bg-white/5 text-white/75"
}

function toTitle(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1)
}

export default async function WorkspaceInvitePage({
    params,
}: {
    params: Promise<{ token: string }>
}) {
    const { token } = await params

    let invite: Awaited<ReturnType<typeof getWorkspaceInvitePreview>> = null
    let inviteLoadError: string | null = null

    try {
        invite = await getWorkspaceInvitePreview(token)
    } catch (error: unknown) {
        inviteLoadError = error instanceof Error ? error.message : "Failed to load invite"
    }

    if (!invite) {
        return (
            <div className="min-h-screen bg-[#0b0b0f] px-4 py-16 text-white">
                <div className="mx-auto w-full max-w-xl">
                    <Card className="border-white/10 bg-[#151620] text-white/85">
                        <CardHeader>
                            <CardTitle className="text-white/90">Invite Unavailable</CardTitle>
                            <CardDescription className="text-white/50">
                                {inviteLoadError || "This invite link is invalid or no longer exists."}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex gap-3">
                            <Button asChild className="border border-cyan-300/20 bg-white/5 text-white hover:bg-white/10">
                                <Link href="/login">Go to Login</Link>
                            </Button>
                            <Button asChild variant="outline" className="border-white/10 bg-transparent text-white/80 hover:bg-white/5">
                                <Link href="/">Home</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`)
    }

    const userEmail = (user.email || "").toLowerCase()
    const inviteEmail = invite.email.toLowerCase()
    const emailMatches = userEmail === inviteEmail
    const isPendingAndValid = invite.status === "pending" && !invite.is_expired

    async function handleAcceptInvite() {
        "use server"

        await acceptWorkspaceInvite(token)
        redirect("/dashboard/settings")
    }

    return (
        <div className="min-h-screen bg-[#0b0b0f] px-4 py-16 text-white">
            <div className="mx-auto w-full max-w-xl">
                <Card className="border-white/10 bg-[#151620] text-white/85 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
                    <CardHeader className="space-y-3">
                        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100">
                            <Users className="h-3.5 w-3.5" />
                            Workspace Invite
                        </div>
                        <CardTitle className="text-xl text-white/95">
                            Join {invite.workspace_name}
                        </CardTitle>
                        <CardDescription className="text-white/50">
                            You were invited to collaborate on this workspace.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-3 rounded-xl border border-white/10 bg-[#1b1d28] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm text-white/70">Role</div>
                                <Badge className={`border ${roleBadgeClass(invite.role)}`}>
                                    <Shield className="h-3 w-3" />
                                    {toTitle(invite.role)}
                                </Badge>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-sm text-white/70">
                                    <Mail className="h-3.5 w-3.5" />
                                    Invited email
                                </div>
                                <span className="text-sm text-white/90">{invite.email}</span>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm text-white/70">Status</div>
                                <Badge className={`border ${statusBadgeClass(invite.status)}`}>
                                    {toTitle(invite.status)}
                                </Badge>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm text-white/70">Expires</div>
                                <span className="text-sm text-white/90">{formatDate(invite.expires_at)}</span>
                            </div>
                        </div>

                        {!isPendingAndValid && (
                            <div className="rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100/90">
                                {invite.status !== "pending"
                                    ? `This invite is ${invite.status}. Ask the workspace owner for a new invite if needed.`
                                    : "This invite has expired. Ask the workspace owner to create a new invite."}
                            </div>
                        )}

                        {isPendingAndValid && !emailMatches && (
                            <div className="rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100/90">
                                You are signed in as <strong>{user.email}</strong>. Sign in with <strong>{invite.email}</strong> to accept this invite.
                            </div>
                        )}

                        <div className="flex flex-col gap-2 sm:flex-row">
                            {isPendingAndValid && emailMatches ? (
                                <form action={handleAcceptInvite} className="w-full sm:w-auto">
                                    <AcceptInviteSubmit />
                                </form>
                            ) : (
                                <Button asChild className="border border-cyan-300/20 bg-white/5 text-white hover:bg-white/10">
                                    <Link href="/dashboard">Open Dashboard</Link>
                                </Button>
                            )}
                            <Button asChild variant="outline" className="border-white/10 bg-transparent text-white/80 hover:bg-white/5">
                                <Link href="/dashboard/settings">Workspace Settings</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
