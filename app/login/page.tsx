"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, KeyRound, UserPlus, Zap, ArrowRight } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
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

export default function LoginPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isGoogleLoading, setIsGoogleLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const router = useRouter()
    const supabase = createClient()

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)
        setSuccess(null)

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password
            })
            if (error) throw error
            router.push('/dashboard')
        } catch (error: any) {
            console.error(error)
            setError(error.message || "Authentication failed")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)
        setSuccess(null)

        if (password !== confirmPassword) {
            setError("Passwords do not match")
            setIsLoading(false)
            return
        }

        if (password.length < 6) {
            setError("Password must be at least 6 characters")
            setIsLoading(false)
            return
        }

        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || location.origin}/auth/callback`,
                }
            })
            if (error) throw error

            if (data.session) {
                router.push('/dashboard')
            } else {
                setSuccess("Check your email for a confirmation link to complete your registration.")
            }
        } catch (error: any) {
            console.error(error)
            setError(error.message || "Sign up failed")
        } finally {
            setIsLoading(false)
        }
    }

    const handleGoogleLogin = async () => {
        if (isLoading || isGoogleLoading) return
        setIsGoogleLoading(true)
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${location.origin}/auth/callback`,
                },
            })
            if (error) throw error
        } catch (error) {
            console.error(error)
            setIsGoogleLoading(false)
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

                {/* Brand */}
                <div className="flex flex-col items-center mb-8">
                    <div
                        className="flex h-12 w-12 items-center justify-center rounded-xl mb-5 shadow-lg"
                        style={{
                            background: 'linear-gradient(135deg, #f59e0b 0%, #fb7185 55%, #22d3ee 100%)',
                            boxShadow: '0 0 30px rgba(34,211,238,0.22), 0 4px 12px rgba(0,0,0,0.4)',
                        }}
                    >
                        <Zap className="h-6 w-6 text-white" />
                    </div>
                    <h1
                        className="text-2xl font-bold tracking-tight"
                        style={{ color: AUTH_THEME.text }}
                    >
                        SocialAI
                    </h1>
                    <p className="text-sm mt-1 text-center" style={{ color: AUTH_THEME.textMuted }}>
                        AI-assisted social ops for Instagram + Facebook
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                        {["Publishing", "Messages", "Analytics", "Automations"].map((pill, i) => (
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
                            className="grid w-full grid-cols-2 mb-6 h-10 p-1 rounded-lg gap-1"
                            style={{
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <TabsTrigger
                                value="signin"
                                className="rounded-md text-xs font-semibold uppercase tracking-wider transition-all duration-200 data-[state=inactive]:text-white/30 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-white/10 data-[state=active]:bg-white/[0.05]"
                            >
                                Sign In
                            </TabsTrigger>
                            <TabsTrigger
                                value="signup"
                                className="rounded-md text-xs font-semibold uppercase tracking-wider transition-all duration-200 data-[state=inactive]:text-white/30 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-white/10 data-[state=active]:bg-white/[0.05]"
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
                                        className="h-10 border-0 rounded-lg text-white placeholder:text-white/20 focus-visible:ring-[2px]"
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
                                        className="h-10 border-0 rounded-lg text-white placeholder:text-white/20 focus-visible:ring-[2px]"
                                        style={{
                                            background: 'rgba(255,255,255,0.06)',
                                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                                        }}
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-10 font-semibold text-white border-0 rounded-lg mt-2 transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
                                    disabled={isLoading || isGoogleLoading}
                                    style={{
                                        background: 'linear-gradient(135deg, #f59e0b 0%, #fb7185 55%, #22d3ee 100%)',
                                        boxShadow: '0 8px 26px rgba(34,211,238,0.14), 0 1px 0 rgba(255,255,255,0.1) inset',
                                    }}
                                >
                                    {isLoading
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <><KeyRound className="h-4 w-4" />Sign In<ArrowRight className="h-3.5 w-3.5 ml-auto opacity-50" /></>
                                    }
                                </Button>
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
                                        className="p-3 text-sm rounded-lg"
                                    style={{
                                        background: 'rgba(132,204,22,0.08)',
                                        border: '1px solid rgba(34,197,94,0.2)',
                                        color: '#84cc16',
                                    }}
                                >
                                        {success}
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
                                        className="h-10 border-0 rounded-lg text-white placeholder:text-white/20 focus-visible:ring-[2px]"
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
                                        placeholder="Min. 6 characters"
                                        autoComplete="new-password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        disabled={isLoading}
                                        className="h-10 border-0 rounded-lg text-white placeholder:text-white/20 focus-visible:ring-[2px]"
                                        style={{
                                            background: 'rgba(255,255,255,0.06)',
                                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                                        }}
                                    />
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
                                        className="h-10 border-0 rounded-lg text-white placeholder:text-white/20 focus-visible:ring-[2px]"
                                        style={{
                                            background: 'rgba(255,255,255,0.06)',
                                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                                        }}
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-10 font-semibold text-white border-0 rounded-lg mt-2 transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
                                    disabled={isLoading || isGoogleLoading}
                                    style={{
                                        background: 'linear-gradient(135deg, #f59e0b 0%, #fb7185 55%, #22d3ee 100%)',
                                        boxShadow: '0 8px 26px rgba(34,211,238,0.14), 0 1px 0 rgba(255,255,255,0.1) inset',
                                    }}
                                >
                                    {isLoading
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <><UserPlus className="h-4 w-4" />Create Account<ArrowRight className="h-3.5 w-3.5 ml-auto opacity-50" /></>
                                    }
                                </Button>
                            </form>
                        </TabsContent>
                    </Tabs>

                    {/* Divider */}
                    <div className="my-5 flex items-center gap-3">
                        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                        <span
                            className="text-[10px] font-semibold uppercase tracking-widest"
                            style={{ color: 'rgba(255,255,255,0.2)' }}
                        >
                            or
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                    </div>

                    {/* Google OAuth */}
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={isLoading || isGoogleLoading}
                        className="group w-full h-10 flex items-center justify-center gap-2.5 rounded-lg text-sm font-medium transition-all duration-200 active:scale-[0.98]"
                        style={{
                            background: 'rgba(255,255,255,0.035)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.68)',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                            e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.035)'
                            e.currentTarget.style.color = 'rgba(255,255,255,0.68)'
                        }}
                    >
                        {isGoogleLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                Redirecting to Google…
                            </>
                        ) : (
                            <>
                                <svg className="h-4 w-4 shrink-0" viewBox="0 0 488 512" aria-hidden="true">
                                    <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" />
                                </svg>
                                Continue with Google
                            </>
                        )}
                    </button>
                </div>

                {/* Footer links */}
                <p className="text-center text-[11px] mt-5" style={{ color: 'rgba(255,255,255,0.18)' }}>
                    By continuing you agree to our{' '}
                    <a href="/terms" className="underline underline-offset-2 transition-colors hover:text-white/40">
                        Terms
                    </a>{' '}
                    &{' '}
                    <a href="/privacy" className="underline underline-offset-2 transition-colors hover:text-white/40">
                        Privacy Policy
                    </a>
                </p>
            </div>
        </div>
    )
}
