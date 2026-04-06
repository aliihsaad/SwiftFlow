"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Mail, ArrowRight, ChevronLeft } from "lucide-react"

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

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [submitted, setSubmitted] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        try {
            const res = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            })
            const data = await res.json().catch(() => ({}))
            if (res.status === 429) {
                throw new Error(data?.error || "Too many password reset attempts. Please try again later.")
            }
            setSubmitted(true)
        } catch {
            // Show success even on error to prevent email enumeration
            setSubmitted(true)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div
            className="dark relative min-h-screen flex items-center justify-center overflow-hidden"
            style={{ background: AUTH_THEME.bg }}
        >
            {/* Ambient glow blobs */}
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
                {/* Back to login */}
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
                        Reset Password
                    </h1>
                    <p className="text-sm mt-1 text-center" style={{ color: AUTH_THEME.textMuted }}>
                        Enter your email and we&apos;ll send you a reset link
                    </p>
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
                    {submitted ? (
                        <div
                            className="p-3 text-sm rounded-lg"
                            style={{
                                background: 'rgba(132,204,22,0.08)',
                                border: '1px solid rgba(34,197,94,0.2)',
                                color: '#84cc16',
                            }}
                        >
                            If an account exists for <strong>{email}</strong>, you&apos;ll receive a password reset link shortly. Check your inbox and spam folder.
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
                                    htmlFor="reset-email"
                                    className="text-xs font-semibold uppercase tracking-wider"
                                    style={{ color: 'rgba(255,255,255,0.42)' }}
                                >
                                    Email
                                </Label>
                                <Input
                                    id="reset-email"
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
                                    ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</>
                                    : <><Mail className="h-4 w-4" />Send Reset Link<ArrowRight className="h-3.5 w-3.5 ml-auto opacity-50" /></>
                                }
                            </Button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
