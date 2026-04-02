import Link from "next/link"
import { ArrowLeft, ArrowRight, Check, Sparkles, Zap, ChevronRight } from "lucide-react"

export const metadata = {
  title: "Pricing | SwiftFlow",
  description:
    "Pricing direction for SwiftFlow. Billing is not live yet; this page explains the planned workspace-based subscription model.",
}

const freePlan = [
  "Instagram + Facebook account connection",
  "Post creation and scheduling",
  "AI-assisted workflows with your own provider key",
  "Brand profile and AI-assisted workflows",
]

const proPlan = [
  "Higher automation volume limits",
  "Advanced analytics and reporting exports",
  "Team roles / collaboration improvements",
  "Workspace-level usage enforcement",
  "Priority support and faster issue turnaround",
]

export default function PricingPage() {
  return (
    <div className="min-h-screen dark bg-black text-white selection:bg-cyan-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 min-h-screen pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-cyan-500/10 blur-[150px] rounded-full opacity-40 mix-blend-screen" />
        <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] bg-fuchsia-500/10 blur-[150px] rounded-full opacity-40 mix-blend-screen" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,black_80%)]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/5 bg-black/40 backdrop-blur-2xl">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-2 text-sm font-bold text-white/50 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Back to home
          </Link>
          <Link
            href="/login"
            className="group relative inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold text-black bg-white overflow-hidden transition-all hover:scale-105 active:scale-95"
          >
            <span className="relative z-10 transition-colors group-hover:text-black">Open Dashboard</span>
            <div className="relative z-10 w-6 h-6 rounded-full bg-black/10 flex items-center justify-center group-hover:bg-black/20 transition-colors">
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
            <div className="absolute inset-0 bg-linear-to-r from-white via-cyan-100 to-white opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          </Link>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-6 py-24 md:py-32 flex flex-col items-center">
        {/* Header Section */}
        <div className="max-w-3xl text-center flex flex-col items-center mb-20">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mb-8">
            <Sparkles className="h-3.5 w-3.5" />
            Pricing Plans
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-tight text-white mb-6">
            Start for free.<br />
            <span className="text-transparent bg-clip-text bg-linear-to-r from-white/40 to-white/10">Pro expansion soon.</span>
          </h1>
          <p className="text-lg md:text-xl leading-relaxed text-white/50 font-medium max-w-2xl">
            Billing is not live yet. The current product can be used without checkout, and paid plans will only launch after workspace entitlements and usage enforcement are implemented.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid lg:grid-cols-2 gap-8 w-full max-w-5xl">

          {/* Free Tier Card */}
          <section className="relative group rounded-[2.5rem] p-8 md:p-12 bg-[#050505] border border-white/5 shadow-2xl overflow-hidden transition-all duration-500 hover:border-cyan-500/30">
            <div className="absolute inset-0 bg-linear-to-b from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-start justify-between gap-4 mb-8">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400 mb-3">
                    Free
                  </p>
                  <h2 className="text-4xl font-black text-white mb-3">Start Free</h2>
                  <p className="text-sm leading-relaxed text-white/40 font-medium max-w-[250px]">
                    Best for solo creators and early testing while the billing system is still being built.
                  </p>
                </div>
                <div className="rounded-3xl px-6 py-4 bg-white/5 border border-white/10 text-right backdrop-blur-md">
                  <p className="text-5xl font-black text-white tracking-tight">$0</p>
                  <p className="text-xs font-bold uppercase tracking-widest text-white/30 mt-1">Forever</p>
                </div>
              </div>

              <div className="space-y-4 mb-12 flex-1">
                {freePlan.map((item) => (
                  <div key={item} className="flex items-start gap-4">
                    <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 border border-cyan-500/20">
                      <Check className="h-3.5 w-3.5 text-cyan-400" />
                    </div>
                    <p className="text-base font-medium text-white/80">
                      {item}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-auto">
                <Link
                  href="/login"
                  className="group/btn relative flex flex-1 items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-bold text-black bg-white overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span className="relative z-10">Start for Free</span>
                  <ArrowRight className="h-4 w-4 relative z-10 transition-transform duration-300 group-hover/btn:translate-x-1" />
                  <div className="absolute inset-0 bg-linear-to-r from-white via-cyan-100 to-white opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />
                </Link>
                <Link
                  href="/#faq"
                  className="inline-flex items-center justify-center px-6 py-4 rounded-xl text-sm font-bold text-white transition-all duration-300 bg-white/5 border border-white/10 hover:bg-white/10 shrink-0"
                >
                  Read FAQ
                </Link>
              </div>
            </div>
          </section>

          {/* Pro Tier Card */}
          <section className="relative group rounded-[2.5rem] p-8 md:p-12 bg-[#0a0a0a] border border-white/5 shadow-2xl overflow-hidden transition-all duration-500 hover:border-amber-500/30">
            <div className="absolute inset-0 bg-linear-to-b from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.08),transparent_50%)]" />

            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-start justify-between gap-4 mb-8">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-500 mb-3">
                    Pro
                  </p>
                  <h2 className="text-4xl font-black text-white mb-3">Pro Plan</h2>
                  <p className="text-sm leading-relaxed text-white/40 font-medium max-w-[250px]">
                    Planned for teams that need higher limits, deeper analytics, and stronger operational controls.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase bg-amber-500/10 border border-amber-500/20 text-amber-400 h-fit">
                  <Zap className="h-3.5 w-3.5" />
                  Soon
                </div>
              </div>

              <div className="space-y-4 mb-12 flex-1">
                {proPlan.map((item) => (
                  <div key={item} className="flex items-start gap-4 opacity-70 group-hover:opacity-100 transition-opacity duration-500">
                    <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20">
                      <Check className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                    <p className="text-base font-medium text-white/80">
                      {item}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-auto rounded-2xl p-5 bg-white/5 border border-white/10 backdrop-blur-md">
                <p className="text-sm font-bold text-white mb-2">
                  Billing is not live yet.
                </p>
                <p className="text-xs leading-relaxed text-white/40 font-medium">
                  We are validating workspace limits, automation enforcement, analytics retention, and team entitlements before publishing final pricing.
                </p>
              </div>
            </div>
          </section>

        </div>

        {/* Footer Notes Plate */}
        <div className="mt-16 w-full max-w-5xl rounded-[2rem] p-8 md:p-10 bg-[#050505] border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-fuchsia-500/5 blur-[80px] group-hover:bg-fuchsia-500/10 transition-colors duration-700" />

          <div className="relative z-10 flex flex-col lg:flex-row gap-8 lg:items-center justify-between">
            <div className="max-w-xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-4">
                Architecture Notes
              </p>
              <p className="text-sm leading-relaxed text-white/50 font-medium">
                Pricing will be tied to enforceable workspace limits such as connected accounts, scheduled post volume, automation volume, exports, and team seats. AI costs remain separate under a BYOK model.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              {["Workspace Billing", "Usage Limits", "AI BYOK", "Team Seats"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 text-white/40"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
