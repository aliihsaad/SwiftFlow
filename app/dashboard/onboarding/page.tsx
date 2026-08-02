"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Building2, Check, Loader2, ShieldCheck, Sparkles, Workflow } from "lucide-react"
import { createWorkspace } from "@/app/actions/workspace"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

export default function CreateFirstWorkspace() {
    const [name, setName] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()

    const handleCreate = async (event: React.FormEvent) => {
        event.preventDefault()
        setIsLoading(true)
        setError(null)

        try {
            await createWorkspace(name)
            toast.success("Workspace created")
            router.push("/dashboard/onboarding/instagram")
        } catch (caughtError: unknown) {
            const message = caughtError instanceof Error ? caughtError.message : "Failed to create workspace"
            setError(message)
            toast.error(message)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="mx-auto flex min-h-full w-full max-w-6xl items-center py-6 sm:py-10">
            <section className="sf-panel relative grid w-full overflow-hidden lg:grid-cols-[1.08fr_0.92fr]">
                <div className="relative overflow-hidden border-b border-white/[0.07] p-7 sm:p-10 lg:border-b-0 lg:border-r">
                    <div className="pointer-events-none absolute -left-32 -top-28 h-80 w-80 rounded-full bg-violet-500/18 blur-3xl" />
                    <div className="pointer-events-none absolute -bottom-40 right-0 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
                    <div className="relative">
                        <div className="sf-kicker">
                            <Sparkles className="h-3.5 w-3.5" />
                            Welcome to SwiftFlow
                        </div>
                        <h2 className="mt-5 max-w-xl text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl">
                            Your social command center starts here.
                        </h2>
                        <p className="mt-4 max-w-lg text-sm leading-6 text-white/50 sm:text-base">
                            Create a workspace for your brand, team, or client. Everything—from
                            connected accounts to automations—stays securely isolated inside it.
                        </p>

                        <div className="mt-8 space-y-3">
                            {[
                                { icon: ShieldCheck, text: "Workspace-isolated data and credentials" },
                                { icon: Workflow, text: "Automation-ready Instagram onboarding" },
                                { icon: Check, text: "Invite your team when you are ready" },
                            ].map(({ icon: Icon, text }) => (
                                <div key={text} className="flex items-center gap-3 text-sm text-white/58">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-cyan-100">
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    {text}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex items-center p-7 sm:p-10">
                    <form onSubmit={handleCreate} className="w-full">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-400/10 text-violet-100">
                            <Building2 className="h-6 w-6" />
                        </div>
                        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.17em] text-white/30">
                            Step 1 of 2
                        </p>
                        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
                            Name your workspace
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-white/45">
                            Use your company, brand, or client name. You can change it later.
                        </p>

                        {error ? (
                            <div className="mt-5 rounded-xl border border-rose-300/15 bg-rose-400/[0.06] p-3 text-sm text-rose-100/80">
                                {error}
                            </div>
                        ) : null}

                        <div className="mt-6 space-y-2">
                            <label htmlFor="workspace-name" className="text-xs font-semibold text-white/65">
                                Workspace name
                            </label>
                            <Input
                                id="workspace-name"
                                placeholder="e.g. Swift Digital Solutions"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                required
                                disabled={isLoading}
                                autoFocus
                                className="h-12 border-white/10 bg-white/[0.04] text-white placeholder:text-white/25 focus-visible:ring-cyan-300/50"
                            />
                        </div>

                        <Button
                            type="submit"
                            className="mt-6 h-12 w-full gap-2 bg-linear-to-r from-violet-600 to-indigo-600 font-semibold text-white shadow-[0_12px_30px_rgba(72,52,166,0.24)] hover:brightness-110"
                            disabled={isLoading || !name.trim()}
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Create workspace
                            {isLoading ? null : <ArrowRight className="h-4 w-4" />}
                        </Button>
                        <p className="mt-4 text-center text-xs text-white/28">
                            Next, you will connect and verify Instagram.
                        </p>
                    </form>
                </div>
            </section>
        </div>
    )
}
