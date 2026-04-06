"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Lock, ArrowRight, ChevronLeft, Check } from "lucide-react"
import { createClient } from "@/utils/supabase/client"

const AUTH_THEME = {
    bg: "#0b0b0f",
    panel: "#151620",
    border: "rgba(255,255,255,0.08)",
    text: "rgba(255,255,255,0.94)",
    textMuted: "rgba(255,255,255,0.48)",
}

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

export function ResetPasswordForm() {
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isInitializing, setIsInitializing] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        let cancelled = false

        const prepareRecoverySession = async () => {
            try {
                const url = new URL(window.location.href)
                const searchParams = url.searchParams
                const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""))

                const recoveryResponse = await fetch("/api/auth/recovery-session", {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store",
                })
                const recoveryState = recoveryResponse.ok
                    ? await recoveryResponse.json().catch(() => ({ authorized: false }))
                    : { authorized: false }

                const hasRecoveryCookie = recoveryState.authorized === true
                const code = searchParams.get("code")
                const tokenHash = searchParams.get("token_hash")
                const type = searchParams.get("type")
                const accessToken = hashParams.get("access_token")
                const refreshToken = hashParams.get("refresh_token")

                let authError: string | null = null

                if (hasRecoveryCookie) {
                    return
                }

                if (code) {
                    const { error } = await supabase.auth.exchangeCodeForSession(code)
                    if (error) authError = error.message
                } else if (tokenHash && type === "recovery") {
                    const { error } = await supabase.auth.verifyOtp({
                        token_hash: tokenHash,
                        type: "recovery",
                    })
                    if (error) authError = error.message
                } else if (accessToken && refreshToken) {
                    const { error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                    })
                    if (error) authError = error.message
                } else {
                    authError = "Password reset link is missing or invalid."
                }

                if (authError) {
                    if (!cancelled) {
                        setError(authError)
                    }
                    return
                }

                if (code || tokenHash || accessToken || refreshToken) {
                    window.history.replaceState({}, document.title, "/reset-password")
                }
            } catch {
                if (!cancelled) {
                    setError("Password reset link is invalid or expired")
                }
            } finally {
                if (!cancelled) {
                    setIsInitializing(false)
                }
            }
        }

        void prepareRecoverySession()

        return () => {
            cancelled = true
        }
    }, [supabase.auth])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (password !== confirmPassword) {
            setError("Passwords do not match")
            return
        }

        const policyError = validatePasswordAgainstPolicy(password)
        if (policyError) {
            setError(policyError)
            return
        }

        setIsLoading(true)

        try {
            const { error } = await supabase.auth.updateUser({ password })
            if (error) throw error
            setSuccess(true)
            setTimeout(() => router.push("/dashboard"), 2000)
        } catch {
            setError("Failed to update password")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div
            className="dark relative min-h-screen flex items-center justify-center overflow-hidden"
            style={{ background: AUTH_THEME.bg }}
        >
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div
                    className="absolute -left-48 top-1/4 h-[500px] w-[500px] rounded-full blur-[120px]"
                    style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.16) 0%, transparent 70%)' }}
                />
                <div
                    className="absolute -right-48 bottom-1/4 h-[400px] w-[400px] rounded-full blur-[100px]"
                    style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.16) 0%, transparent 70%)' }}
                />
                <div
                    className="absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 blur-[80px]"
                    style={{ background: 'radial-gradient(ellipse, rgba(251,113,133,0.09) 0%, transparent 70%)' }}
                />
            </div>

            <div
                className="pointer-events-none absolute inset-0 opacity-[0.015]"
                style={{
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                }}
            />

            <div className="relative z-10 w-full max-w-[420px] mx-4 animate-in fade-in slide-in-from-bottom-6 duration-700 fill-mode-both">
                <div className="mb-5">
                    <Link
                        href="/login"
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:bg-white/5"
                        style={{
                            color: "rgba(255,255,255,0.5)",
                            border: "1px solid rgba(255,255,255,0.07)",
                            background: "rgba(21,22,32,0.72)",
                            backdropFilter: "blur(14px)",
                            WebkitBackdropFilter: "blur(14px)",
                        }}
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Back to Sign In
                    </Link>
                </div>

                <div className="flex flex-col items-center mb-8">
                    <Image
                        src="/logo.png"
                        alt="SwiftFlow Logo"
                        width={48}
                        height={48}
                        className="mb-5 rounded-xl shadow-[0_0_30px_rgba(34,211,238,0.22),0_4px_12px_rgba(0,0,0,0.4)]"
                    />
                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: AUTH_THEME.text }}>
                        New Password
                    </h1>
                    <p className="text-sm mt-1 text-center" style={{ color: AUTH_THEME.textMuted }}>
                        Choose a strong password for your account
                    </p>
                </div>

                <div
                    className="rounded-2xl p-7"
                    style={{
                        background: 'linear-gradient(180deg, rgba(18,19,26,0.88), rgba(11,11,15,0.92))',
                        border: `1px solid ${AUTH_THEME.border}`,
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                        boxShadow: '0 32px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.04)',
                    }}
                >
                    {isInitializing ? (
                        <div
                            className="p-3 text-sm rounded-lg flex items-center gap-2"
                            style={{
                                background: 'rgba(34,211,238,0.08)',
                                border: '1px solid rgba(34,211,238,0.2)',
                                color: '#67e8f9',
                            }}
                        >
                            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                            Preparing your password reset session...
                        </div>
                    ) : success ? (
                        <div
                            className="p-3 text-sm rounded-lg flex items-center gap-2"
                            style={{
                                background: 'rgba(132,204,22,0.08)',
                                border: '1px solid rgba(34,197,94,0.2)',
                                color: '#84cc16',
                            }}
                        >
                            <Check className="h-4 w-4 shrink-0" />
                            Password updated successfully. Redirecting to dashboard...
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div
                                    className="p-3 text-sm rounded-lg"
                                    style={{
                                        background: 'rgba(251,113,133,0.08)',
                                        border: '1px solid rgba(239,68,68,0.2)',
                                        color: '#fb7185',
                                    }}
                                >
                                    {error}
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="new-password"
                                    className="text-xs font-semibold uppercase tracking-wider"
                                    style={{ color: 'rgba(255,255,255,0.42)' }}
                                >
                                    New Password
                                </Label>
                                <Input
                                    id="new-password"
                                    type="password"
                                    placeholder="Min. 10 chars, mixed case, number, symbol"
                                    autoComplete="new-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={isLoading}
                                    className="h-10 border-0 rounded-lg text-white placeholder:text-white/20 focus-visible:ring-2"
                                    style={{
                                        background: 'rgba(255,255,255,0.06)',
                                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                                    }}
                                />
                                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.36)' }}>
                                    Use at least 10 characters with uppercase, lowercase, a number, and a symbol.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="confirm-new-password"
                                    className="text-xs font-semibold uppercase tracking-wider"
                                    style={{ color: 'rgba(255,255,255,0.42)' }}
                                >
                                    Confirm Password
                                </Label>
                                <Input
                                    id="confirm-new-password"
                                    type="password"
                                    placeholder="Confirm your new password"
                                    autoComplete="new-password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    disabled={isLoading}
                                    className="h-10 border-0 rounded-lg text-white placeholder:text-white/20 focus-visible:ring-2"
                                    style={{
                                        background: 'rgba(255,255,255,0.06)',
                                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                                    }}
                                />
                            </div>

                            <Button
                                type="submit"
                                className="w-full h-10 font-semibold text-white border-0 rounded-lg mt-2 transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
                                disabled={isLoading}
                                style={{
                                    background: 'linear-gradient(135deg, #f59e0b 0%, #fb7185 55%, #22d3ee 100%)',
                                    boxShadow: '0 8px 26px rgba(34,211,238,0.14), 0 1px 0 rgba(255,255,255,0.1) inset',
                                }}
                            >
                                {isLoading
                                    ? <><Loader2 className="h-4 w-4 animate-spin" />Updating…</>
                                    : <><Lock className="h-4 w-4" />Update Password<ArrowRight className="h-3.5 w-3.5 ml-auto opacity-50" /></>
                                }
                            </Button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
