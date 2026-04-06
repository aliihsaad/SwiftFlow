"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Loader2, Lock, Mail, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { deleteAccount, updatePassword } from "@/app/actions/auth"

const panelClass = "border-white/10 bg-[#151620] text-white/85 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_18px_48px_rgba(0,0,0,0.24)]"
const inputClass = "h-10 border-white/10 bg-[#1b1d28] text-white/85 placeholder:text-white/25 focus-visible:ring-1 focus-visible:ring-white/20"
const labelClass = "text-xs font-semibold uppercase tracking-wider text-white/45"

const PASSWORD_POLICY = {
    minLength: 10,
    requiresLowercase: true,
    requiresUppercase: true,
    requiresDigit: true,
    requiresSymbol: true,
}

function validatePasswordAgainstPolicy(password: string): string | null {
    if (password.length < PASSWORD_POLICY.minLength) {
        return `Password must be at least ${PASSWORD_POLICY.minLength} characters`
    }
    if (PASSWORD_POLICY.requiresLowercase && !/[a-z]/.test(password)) {
        return "Password must include a lowercase letter"
    }
    if (PASSWORD_POLICY.requiresUppercase && !/[A-Z]/.test(password)) {
        return "Password must include an uppercase letter"
    }
    if (PASSWORD_POLICY.requiresDigit && !/[0-9]/.test(password)) {
        return "Password must include a number"
    }
    if (PASSWORD_POLICY.requiresSymbol && !/[^A-Za-z0-9]/.test(password)) {
        return "Password must include a symbol"
    }
    return null
}

// ─── Change Password ───────────────────────────────────────────

function ChangePasswordForm() {
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)

    const clearForm = () => {
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (newPassword !== confirmPassword) {
            toast.error("Passwords do not match")
            return
        }

        const policyError = validatePasswordAgainstPolicy(newPassword)
        if (policyError) {
            toast.error(policyError)
            return
        }

        setIsLoading(true)
        try {
            const result = await updatePassword(currentPassword, newPassword)
            if (!result.ok) {
                toast.error(result.error || "Failed to update password")
                return
            }

            toast.success("Password updated successfully")
            clearForm()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to update password")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card className={panelClass}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white/90">
                    <Lock className="h-4 w-4" />
                    Change Password
                </CardTitle>
                <CardDescription className="text-white/50">
                    Update your account password. You&apos;ll stay signed in after the change.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
                    <div className="space-y-1.5">
                        <Label htmlFor="current-pw" className={labelClass}>Current Password</Label>
                        <Input
                            id="current-pw"
                            type="password"
                            placeholder="Enter your current password"
                            autoComplete="current-password"
                            required
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            disabled={isLoading}
                            className={inputClass}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="new-pw" className={labelClass}>New Password</Label>
                        <Input
                            id="new-pw"
                            type="password"
                            placeholder="Min. 10 chars, mixed case, number, symbol"
                            autoComplete="new-password"
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            disabled={isLoading}
                            className={inputClass}
                        />
                        <p className="text-[11px] text-white/35">
                            Use at least 10 characters with uppercase, lowercase, a number, and a symbol.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="confirm-pw" className={labelClass}>Confirm New Password</Label>
                        <Input
                            id="confirm-pw"
                            type="password"
                            placeholder="Confirm your new password"
                            autoComplete="new-password"
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            disabled={isLoading}
                            className={inputClass}
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="border border-cyan-300/20 bg-gradient-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/30 hover:via-cyan-300/20 hover:to-amber-300/25"
                    >
                        {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Updating…</> : "Update Password"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}

// ─── Change Email ──────────────────────────────────────────────

function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
    const [newEmail, setNewEmail] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [sent, setSent] = useState(false)
    const supabase = createClient()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
            toast.error("New email is the same as your current email")
            return
        }

        setIsLoading(true)
        try {
            const emailRedirectTo = `${location.origin}/auth/callback?next=/dashboard/settings`
            const { error } = await supabase.auth.updateUser(
                { email: newEmail },
                { emailRedirectTo }
            )
            if (error) throw error
            setSent(true)
            toast.success("Confirmation email sent")
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to update email")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card className={panelClass}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white/90">
                    <Mail className="h-4 w-4" />
                    Change Email
                </CardTitle>
                <CardDescription className="text-white/50">
                    Your current email is <span className="text-white/70 font-medium">{currentEmail}</span>.
                    Confirmation links will be sent to both your current email and your new email before the change is applied.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {sent ? (
                    <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/8 p-3 text-sm text-emerald-100 max-w-md">
                        Check both inboxes for confirmation links. Your email won&apos;t change until both the current and new email addresses are confirmed.
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
                        <div className="space-y-1.5">
                            <Label htmlFor="new-email" className={labelClass}>New Email</Label>
                            <Input
                                id="new-email"
                                type="email"
                                placeholder="your-new-email@company.com"
                                autoComplete="email"
                                required
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                disabled={isLoading}
                                className={inputClass}
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="border border-cyan-300/20 bg-gradient-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/30 hover:via-cyan-300/20 hover:to-amber-300/25"
                        >
                            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : "Update Email"}
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    )
}

// ─── Delete Account ────────────────────────────────────────────

function DeleteAccountSection() {
    const [confirmText, setConfirmText] = useState("")
    const [currentPassword, setCurrentPassword] = useState("")
    const [isDeleting, setIsDeleting] = useState(false)
    const [open, setOpen] = useState(false)
    const router = useRouter()

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            const result = await deleteAccount(currentPassword)
            if ("error" in result) {
                toast.error(result.error)
                setIsDeleting(false)
                setOpen(false)
                return
            }
            router.replace("/login")
            router.refresh()
        } catch {
            toast.error("Failed to delete account")
            setIsDeleting(false)
            setOpen(false)
        }
    }

    return (
        <Card className="border-red-400/20 bg-[#151620] text-white/85 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_18px_48px_rgba(0,0,0,0.24)]">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-200">
                    <Trash2 className="h-4 w-4" />
                    Delete Account
                </CardTitle>
                <CardDescription className="text-white/50">
                    Permanently delete your account and all associated data. This action cannot be undone.
                    Workspaces you own will also be deleted.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <AlertDialog open={open} onOpenChange={setOpen}>
                    <AlertDialogTrigger asChild>
                        <Button
                            variant="destructive"
                            className="bg-red-500/15 border border-red-400/20 text-red-200 hover:bg-red-500/25 hover:text-red-100"
                        >
                            Delete My Account
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="border-white/10 bg-[#151620] text-white/85">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-white/90">Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription className="text-white/50 space-y-2">
                                <span className="block">
                                    This will permanently delete your account, all workspaces you own,
                                    and remove you from shared workspaces. This action cannot be undone.
                                </span>
                                <span className="block text-white/60 font-medium">
                                    Enter your current password and type <span className="text-red-300 font-bold">DELETE</span> to confirm.
                                </span>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <Input
                            type="password"
                            placeholder="Current password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className={inputClass}
                            autoComplete="current-password"
                        />
                        <Input
                            placeholder="Type DELETE to confirm"
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            className={inputClass}
                        />
                        <AlertDialogFooter>
                            <AlertDialogCancel
                                className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                                onClick={() => {
                                    setConfirmText("")
                                    setCurrentPassword("")
                                }}
                            >
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                disabled={confirmText !== "DELETE" || !currentPassword.trim() || isDeleting}
                                onClick={(e) => {
                                    e.preventDefault()
                                    handleDelete()
                                }}
                                className="bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-40"
                            >
                                {isDeleting ? <><Loader2 className="h-4 w-4 animate-spin" />Deleting…</> : "Delete Account"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    )
}

// ─── Combined Section ──────────────────────────────────────────

export function AccountSettingsSection({ userEmail }: { userEmail: string }) {
    return (
        <div className="space-y-4">
            <ChangePasswordForm />
            <ChangeEmailForm currentEmail={userEmail} />
            <DeleteAccountSection />
        </div>
    )
}
