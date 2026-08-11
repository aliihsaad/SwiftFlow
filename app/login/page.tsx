"use client"

import { Suspense, useState, type FormEvent } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
    ArrowRight,
    Check,
    Instagram,
    KeyRound,
    Loader2,
    LockKeyhole,
    ShieldCheck,
    Workflow,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const GENERIC_SIGNIN_ERROR = "Sign in failed. Check your credentials and try again."
const ACCESS_PATH = [
    { icon: KeyRound, title: "Sign in", copy: "Use an account provisioned for this SwiftFlow instance." },
    { icon: Workflow, title: "Open workspace", copy: "Continue directly to your isolated engagement workspace." },
    { icon: Instagram, title: "Run operations", copy: "Manage Instagram inbox, analytics, and automations." },
]

function getSafeNextPath(rawNext: string | null): string {
    if (!rawNext) return "/dashboard"
    if (!rawNext.startsWith("/") || rawNext.startsWith("//")) return "/dashboard"
    return rawNext
}

function LoginPageContent() {
    const searchParams = useSearchParams()
    const nextPath = getSafeNextPath(searchParams.get("next"))
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSignIn = async (event: FormEvent) => {
        event.preventDefault()
        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch("/api/auth/sign-in", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            })
            const data = await response.json().catch(() => ({}))

            if (!response.ok) {
                throw new Error(data?.error || GENERIC_SIGNIN_ERROR)
            }

            window.location.replace(nextPath)
        } catch (caughtError: unknown) {
            console.error(caughtError)
            setError(caughtError instanceof Error ? caughtError.message : GENERIC_SIGNIN_ERROR)
            setIsLoading(false)
        }
    }

    return (
        <main className="dark relative min-h-screen overflow-hidden bg-[#070910] text-white">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:44px_44px]" />
                <div className="absolute -left-44 top-[-8rem] h-[32rem] w-[32rem] rounded-full bg-violet-500/12 blur-[120px]" />
                <div className="absolute -right-36 bottom-[-10rem] h-[34rem] w-[34rem] rounded-full bg-cyan-400/10 blur-[130px]" />
                <div className="absolute left-[42%] top-[18%] h-56 w-56 rounded-full bg-rose-400/7 blur-[100px]" />
            </div>

            <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1240px] items-center gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:px-10 lg:py-12">
                <section className="order-2 lg:order-1 lg:pr-10" aria-label="SwiftFlow private access">
                    <div className="flex items-center gap-3">
                        <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/35 shadow-[0_16px_45px_rgba(34,211,238,0.17)]">
                            <Image src="/logo.png" alt="" width={48} height={48} className="h-full w-full object-cover" priority />
                        </span>
                        <div>
                            <p className="text-lg font-bold tracking-[-0.03em]">SwiftFlow</p>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/32">
                                Private command center
                            </p>
                        </div>
                    </div>

                    <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-cyan-200/12 bg-cyan-300/[0.055] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.17em] text-cyan-100/75">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Authorized access only
                    </div>
                    <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-[0.98] tracking-[-0.055em] text-white sm:text-5xl lg:text-[3.7rem]">
                        Return to your engagement workspace.
                    </h1>
                    <p className="mt-5 max-w-xl text-sm leading-7 text-white/48 sm:text-base">
                        SwiftFlow is a private Instagram operations workspace. Sign in with the account created by your instance administrator.
                    </p>

                    <div className="mt-9 grid gap-3 sm:grid-cols-3 lg:max-w-2xl">
                        {ACCESS_PATH.map(({ icon: Icon, title, copy }, index) => (
                            <div key={title} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 backdrop-blur-sm">
                                <div className="flex items-center justify-between">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-cyan-100/75">
                                        <Icon className="h-4 w-4" aria-hidden="true" />
                                    </span>
                                    <span className="text-[10px] font-bold tabular-nums text-white/20">0{index + 1}</span>
                                </div>
                                <p className="mt-4 text-sm font-semibold text-white/82">{title}</p>
                                <p className="mt-1.5 text-xs leading-5 text-white/36">{copy}</p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 flex items-start gap-3 text-xs leading-5 text-white/32">
                        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200/65" aria-hidden="true" />
                        <p>New accounts are created during instance setup or by an administrator. Public registration is disabled.</p>
                    </div>
                </section>

                <section className="order-1 lg:order-2" aria-labelledby="login-heading">
                    <div className="relative overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#11131d]/88 p-1 shadow-[0_36px_100px_rgba(0,0,0,0.58)] backdrop-blur-2xl">
                        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-linear-to-r from-transparent via-cyan-200/55 to-transparent" />
                        <div className="rounded-[24px] border border-white/[0.045] bg-linear-to-b from-white/[0.035] to-transparent p-6 sm:p-8">
                            <div className="flex items-start justify-between gap-5">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Secure workspace entry</p>
                                    <h2 id="login-heading" className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-white sm:text-3xl">
                                        Sign in to SwiftFlow
                                    </h2>
                                    <p className="mt-2 text-sm leading-6 text-white/43">Use your provisioned workspace credentials.</p>
                                </div>
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-300/15 bg-violet-400/[0.08] text-violet-100/80">
                                    <KeyRound className="h-5 w-5" aria-hidden="true" />
                                </span>
                            </div>

                            {error ? (
                                <div role="alert" className="mt-6 rounded-2xl border border-rose-300/15 bg-rose-400/[0.065] px-4 py-3 text-sm leading-6 text-rose-100/85">
                                    {error}
                                </div>
                            ) : null}

                            <form onSubmit={handleSignIn} className="mt-7 space-y-5">
                                <div className="space-y-2">
                                    <Label htmlFor="signin-email" className="text-xs font-semibold text-white/62">Email address</Label>
                                    <Input
                                        id="signin-email"
                                        type="email"
                                        placeholder="you@company.com"
                                        autoComplete="email"
                                        required
                                        autoFocus
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        disabled={isLoading}
                                        className="h-12 rounded-xl border-white/[0.09] bg-white/[0.045] px-4 text-white placeholder:text-white/22 focus-visible:border-cyan-200/30 focus-visible:ring-cyan-300/25"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <Label htmlFor="signin-password" className="text-xs font-semibold text-white/62">Password</Label>
                                        <Link href="/forgot-password" className="text-xs font-medium text-cyan-100/48 transition hover:text-cyan-100/80">
                                            Forgot password?
                                        </Link>
                                    </div>
                                    <Input
                                        id="signin-password"
                                        type="password"
                                        autoComplete="current-password"
                                        required
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        disabled={isLoading}
                                        className="h-12 rounded-xl border-white/[0.09] bg-white/[0.045] px-4 text-white placeholder:text-white/22 focus-visible:border-cyan-200/30 focus-visible:ring-cyan-300/25"
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isLoading}
                                    className="h-12 w-full gap-2 rounded-xl border-0 bg-linear-to-r from-violet-600 via-indigo-500 to-cyan-500 font-semibold text-white shadow-[0_16px_38px_rgba(63,82,216,0.25)] transition hover:brightness-110 active:scale-[0.99]"
                                >
                                    {isLoading ? (
                                        <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Signing in…</>
                                    ) : (
                                        <><KeyRound className="h-4 w-4" aria-hidden="true" /> Sign in <ArrowRight className="ml-auto h-4 w-4 opacity-65" aria-hidden="true" /></>
                                    )}
                                </Button>
                            </form>

                            <div className="mt-6 rounded-2xl border border-white/[0.065] bg-black/15 p-4">
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-200/75">
                                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                    </span>
                                    <div>
                                        <p className="text-xs font-semibold text-white/65">Private instance</p>
                                        <p className="mt-1 text-xs leading-5 text-white/34">Need an account? Ask the instance owner to provision one in Supabase Auth.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <p className="mt-5 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-white/20">
                        Vercel + managed Supabase · Workspace-scoped access
                    </p>
                </section>
            </div>
        </main>
    )
}

function LoginPageFallback() {
    return <div className="min-h-screen bg-[#070910]" />
}

export default function LoginPage() {
    return (
        <Suspense fallback={<LoginPageFallback />}>
            <LoginPageContent />
        </Suspense>
    )
}
