"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, KeyRound, UserPlus, ArrowRight, ChevronLeft } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const AUTH_THEME = {
    bg: "#0b0b0f",
    bgSoft: "#111118",
    panel: "#151620",
    border: "rgba(255,255,255,0.08)",
    text: "rgba(255,255,255,0.94)",
    textMuted: "rgba(255,255,255,0.48)",
    amber: "#f59e0b",
    cyan: "#22d3ee",
    coral: "#fb7185",
}

const PASSWORD_POLICY = {
    minLength: 10,
    requiresLowercase: true,
    requiresUppercase: true,
    requiresDigit: true,
    requiresSymbol: true,
}

function getSafeNextPath(rawNext: string | null): string {
    if (!rawNext) return "/dashboard"
    if (!rawNext.startsWith("/") || rawNext.startsWith("//")) return "/dashboard"
    return rawNext
}

const GENERIC_SIGNIN_ERROR = "Sign in failed. Check your credentials and try again."
const GENERIC_SIGNUP_ERROR = "Sign up could not be completed. If the email can be used, you will receive the next step by email."

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

function LoginPageContent() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [activeAction, setActiveAction] = useState<"signin" | "signup" | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [resendCooldown, setResendCooldown] = useState(0)

    const searchParams = useSearchParams()
    const nextPath = getSafeNextPath(searchParams.get("next"))

    const isSigningIn = isLoading && activeAction === "signin"
    const isSigningUp = isLoading && activeAction === "signup"

    const handleResendVerification = async () => {
        if (resendCooldown > 0 || !email) return
        try {
            const res = await fetch("/api/auth/resend-signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, next: nextPath }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error || "Failed to resend verification email")
            }
            setResendCooldown(60)
            const interval = setInterval(() => {
                setResendCooldown((prev) => {
                    if (prev <= 1) { clearInterval(interval); return 0 }
                    return prev - 1
                })
            }, 1000)
        } catch {
            setError("Failed to resend verification email")
        }
    }

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setActiveAction("signin")
        setError(null)
        setSuccess(null)

        try {
            const res = await fetch("/api/auth/sign-in", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    password,
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error || GENERIC_SIGNIN_ERROR)
            }
            window.location.replace(nextPath)
        } catch (error: unknown) {
            console.error(error)
            setError(error instanceof Error ? error.message : GENERIC_SIGNIN_ERROR)
        } finally {
            setIsLoading(false)
            setActiveAction(null)
        }
    }

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setActiveAction("signup")
        setError(null)
        setSuccess(null)

        if (password !== confirmPassword) {
            setError("Passwords do not match")
            setIsLoading(false)
            setActiveAction(null)
            return
        }

        const passwordPolicyError = validatePasswordAgainstPolicy(password)
        if (passwordPolicyError) {
            setError(passwordPolicyError)
            setIsLoading(false)
            setActiveAction(null)
            return
        }

        try {
            const res = await fetch("/api/auth/sign-up", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    password,
                    next: nextPath,
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error || GENERIC_SIGNUP_ERROR)
            }

            if (data?.sessionCreated) {
                window.location.replace(nextPath)
            } else {
                setSuccess("Check your email for a confirmation link to complete your registration.")
            }
        } catch (error: unknown) {
            console.error(error)
            setError(error instanceof Error ? error.message : GENERIC_SIGNUP_ERROR)
        } finally {
            setIsLoading(false)
            setActiveAction(null)
        }
    }

    return (
        <div
            className="dark relative min-h-screen flex items-center justify-center overflow-hidden"
            style={{ background: AUTH_THEME.bg }}
        >
            {/* Ambient landing-style glow blobs */}
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

            {/* Subtle dot grid */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.015]"
                style={{
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                }}
            />

            {/* Main container */}
            <div className="relative z-10 w-full max-w-[420px] mx-4 animate-in fade-in slide-in-from-bottom-6 duration-700 fill-mode-both">
                {/* Back to home */}
                <div className="mb-5">
                    <Link
                        href="/"
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
                        Back to SwiftFlow
                    </Link>
                </div>

                {/* Brand */}
                <div className="flex flex-col items-center mb-8">
                    <Image
                        src="/logo.png"
                        alt="SwiftFlow Logo"
                        width={48}
                        height={48}
                        className="mb-5 rounded-xl shadow-[0_0_30px_rgba(34,211,238,0.22),0_4px_12px_rgba(0,0,0,0.4)]"
                    />
                    <h1
                        className="text-2xl font-bold tracking-tight"
                        style={{ color: AUTH_THEME.text }}
                    >
                        SwiftFlow
                    </h1>
                    <p className="text-sm mt-1 text-center" style={{ color: AUTH_THEME.textMuted }}>
                        AI-assisted engagement operations for Instagram
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                        {["Inbox", "Messages", "Analytics", "Automations"].map((pill, i) => (
                            <span
                                key={pill}
                                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                                style={{
                                    background: i % 2 ? "rgba(34,211,238,0.06)" : "rgba(245,158,11,0.06)",
                                    border: "1px solid rgba(255,255,255,0.06)",
                                    color: "rgba(255,255,255,0.64)",
                                }}
                            >
                                {pill}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Glass card */}
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
                    <Tabs defaultValue="signin" onValueChange={() => { setError(null); setSuccess(null) }}>

                        {/* Tab switcher */}
                        <TabsList
                            className={`grid w-full grid-cols-2 mb-6 h-10 p-1 rounded-lg gap-1 transition-opacity ${isLoading ? "pointer-events-none opacity-70" : ""}`}
                            style={{
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <TabsTrigger
                                value="signin"
                                className="rounded-md text-xs font-semibold uppercase tracking-wider transition-all duration-200 data-[state=inactive]:text-white/30 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-white/10 data-[state=active]:bg-white/5"
                            >
                                Sign In
                            </TabsTrigger>
                            <TabsTrigger
                                value="signup"
                                className="rounded-md text-xs font-semibold uppercase tracking-wider transition-all duration-200 data-[state=inactive]:text-white/30 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-white/10 data-[state=active]:bg-white/5"
                            >
                                Sign Up
                            </TabsTrigger>
                        </TabsList>

                        {/* ── Sign In ── */}
                        <TabsContent value="signin">
                            <form onSubmit={handleSignIn} className="space-y-4">
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
                                {isSigningIn && (
                                    <div
                                        className="space-y-3 rounded-xl p-4 text-sm"
                                        style={{
                                            background: 'linear-gradient(180deg, rgba(34,211,238,0.1), rgba(34,211,238,0.04))',
                                            border: '1px solid rgba(34,211,238,0.2)',
                                            color: 'rgba(219,246,255,0.92)',
                                        }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="flex h-9 w-9 items-center justify-center rounded-full"
                                                style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.2)' }}
                                            >
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="font-semibold">Signing you in</p>
                                                <p className="text-xs" style={{ color: 'rgba(219,246,255,0.68)' }}>
                                                    Preparing your workspace and redirecting you to the dashboard.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                                            <div
                                                className="h-full w-1/2 rounded-full"
                                                style={{
                                                    background: 'linear-gradient(90deg, rgba(34,211,238,0.4), rgba(34,211,238,0.95), rgba(255,255,255,0.85))',
                                                    animation: 'auth-progress 1.25s ease-in-out infinite',
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <Label
                                        htmlFor="signin-email"
                                        className="text-xs font-semibold uppercase tracking-wider"
                                        style={{ color: 'rgba(255,255,255,0.42)' }}
                                    >
                                        Email
                                    </Label>
                                    <Input
                                        id="signin-email"
                                        type="email"
                                        placeholder="you@company.com"
                                        autoComplete="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        disabled={isLoading}
                                        className="h-10 border-0 rounded-lg text-white placeholder:text-white/20 focus-visible:ring-2"
                                        style={{
                                            background: 'rgba(255,255,255,0.06)',
                                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                                        }}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label
                                        htmlFor="signin-password"
                                        className="text-xs font-semibold uppercase tracking-wider"
                                        style={{ color: 'rgba(255,255,255,0.45)' }}
                                    >
                                        Password
                                    </Label>
                                    <Input
                                        id="signin-password"
                                        type="password"
                                        autoComplete="current-password"
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
                                    {isSigningIn
                                        ? <><Loader2 className="h-4 w-4 animate-spin" />Signing In…</>
                                        : <><KeyRound className="h-4 w-4" />Sign In<ArrowRight className="h-3.5 w-3.5 ml-auto opacity-50" /></>
                                    }
                                </Button>

                                <div className="text-center pt-1">
                                    <Link
                                        href="/forgot-password"
                                        className="text-xs transition-colors hover:text-white/50"
                                        style={{ color: 'rgba(255,255,255,0.3)' }}
                                    >
                                        Forgot your password?
                                    </Link>
                                </div>
                            </form>
                        </TabsContent>

                        {/* ── Sign Up ── */}
                        <TabsContent value="signup">
                            <form onSubmit={handleSignUp} className="space-y-4">
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
                                {success && (
                                    <div
                                        className="p-3 text-sm rounded-lg space-y-2"
                                        style={{
                                            background: 'rgba(132,204,22,0.08)',
                                            border: '1px solid rgba(34,197,94,0.2)',
                                            color: '#84cc16',
                                        }}
                                    >
                                        <p>{success}</p>
                                        <button
                                            type="button"
                                            onClick={handleResendVerification}
                                            disabled={resendCooldown > 0}
                                            className="text-xs underline underline-offset-2 transition-colors hover:text-lime-300 disabled:opacity-50 disabled:no-underline disabled:cursor-default"
                                        >
                                            {resendCooldown > 0
                                                ? `Resend available in ${resendCooldown}s`
                                                : "Didn\u2019t receive it? Resend email"}
                                        </button>
                                    </div>
                                )}
                                {isSigningUp && (
                                    <div
                                        className="space-y-3 rounded-xl p-4 text-sm"
                                        style={{
                                            background: 'linear-gradient(180deg, rgba(34,211,238,0.1), rgba(34,211,238,0.04))',
                                            border: '1px solid rgba(34,211,238,0.2)',
                                            color: 'rgba(219,246,255,0.92)',
                                        }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="flex h-9 w-9 items-center justify-center rounded-full"
                                                style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.2)' }}
                                            >
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="font-semibold">Creating your account</p>
                                                <p className="text-xs" style={{ color: 'rgba(219,246,255,0.68)' }}>
                                                    Securing your workspace and preparing the confirmation flow.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                                            <div
                                                className="h-full w-1/2 rounded-full"
                                                style={{
                                                    background: 'linear-gradient(90deg, rgba(34,211,238,0.4), rgba(34,211,238,0.95), rgba(255,255,255,0.85))',
                                                    animation: 'auth-progress 1.25s ease-in-out infinite',
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <Label
                                        htmlFor="signup-email"
                                        className="text-xs font-semibold uppercase tracking-wider"
                                        style={{ color: 'rgba(255,255,255,0.42)' }}
                                    >
                                        Email
                                    </Label>
                                    <Input
                                        id="signup-email"
                                        type="email"
                                        placeholder="you@company.com"
                                        autoComplete="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        disabled={isLoading}
                                        className="h-10 border-0 rounded-lg text-white placeholder:text-white/20 focus-visible:ring-2"
                                        style={{
                                            background: 'rgba(255,255,255,0.06)',
                                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                                        }}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label
                                        htmlFor="signup-password"
                                        className="text-xs font-semibold uppercase tracking-wider"
                                        style={{ color: 'rgba(255,255,255,0.42)' }}
                                    >
                                        Password
                                    </Label>
                                    <Input
                                        id="signup-password"
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
                                        htmlFor="confirm-password"
                                        className="text-xs font-semibold uppercase tracking-wider"
                                        style={{ color: 'rgba(255,255,255,0.42)' }}
                                    >
                                        Confirm Password
                                    </Label>
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        placeholder="Confirm your password"
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
                                        ? <><Loader2 className="h-4 w-4 animate-spin" />Creating Account…</>
                                        : <><UserPlus className="h-4 w-4" />Create Account<ArrowRight className="h-3.5 w-3.5 ml-auto opacity-50" /></>
                                    }
                                </Button>
                            </form>
                        </TabsContent>
                    </Tabs>

                </div>
            </div>
            <style jsx>{`
                @keyframes auth-progress {
                    0% {
                        transform: translateX(-100%);
                    }
                    100% {
                        transform: translateX(220%);
                    }
                }
            `}</style>
        </div>
    )
}

function LoginPageFallback() {
    return (
        <div
            className="min-h-screen"
            style={{ background: AUTH_THEME.bg }}
        />
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={<LoginPageFallback />}>
            <LoginPageContent />
        </Suspense>
    )
}
