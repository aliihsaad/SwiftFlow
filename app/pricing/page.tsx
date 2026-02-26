import Link from "next/link"
import { ArrowLeft, ArrowRight, Check, Sparkles, Zap } from "lucide-react"

export const metadata = {
  title: "Pricing | SwiftFlow",
  description:
    "Simple pricing for SwiftFlow. Start free and upgrade to Pro (coming soon) for advanced automation, analytics, and team features.",
}

const theme = {
  bg: "#0b0b0f",
  bgSoft: "#111118",
  panel: "#151620",
  border: "rgba(255,255,255,0.08)",
  text: "rgba(255,255,255,0.94)",
  textMuted: "rgba(255,255,255,0.52)",
  amber: "#f59e0b",
  cyan: "#22d3ee",
  coral: "#fb7185",
  lime: "#84cc16",
}

const freePlan = [
  "Instagram + Facebook account connection",
  "Post creation and scheduling",
  "Unified inbox (IG + FB messages)",
  "Automation canvas + templates",
  "Brand profile and AI-assisted workflows",
]

const proPlan = [
  "Higher automation volume limits",
  "Advanced analytics and reporting exports",
  "Team roles / collaboration improvements",
  "More AI usage and premium presets",
  "Priority support and faster issue turnaround",
]

export default function PricingPage() {
  return (
    <div
      className="min-h-screen dark"
      style={{
        background: theme.bg,
        color: theme.text,
      }}
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(circle at 12% 12%, rgba(34,211,238,0.10), transparent 35%), radial-gradient(circle at 88% 18%, rgba(245,158,11,0.10), transparent 36%), radial-gradient(circle at 65% 82%, rgba(251,113,133,0.07), transparent 40%)",
        }}
      />

      <header
        className="sticky top-0 z-20"
        style={{
          background: "rgba(11,11,15,0.8)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "rgba(255,255,255,0.84)" }}>
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{
              background: "linear-gradient(135deg, #f59e0b 0%, #fb7185 55%, #22d3ee 100%)",
              boxShadow: "0 8px 24px rgba(34,211,238,0.14)",
            }}
          >
            Open Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-6 py-16 md:py-20">
        <div className="max-w-3xl">
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{
              background: "rgba(34,211,238,0.07)",
              border: "1px solid rgba(34,211,238,0.16)",
              color: "rgba(255,255,255,0.82)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" style={{ color: theme.cyan }} />
            Pricing
          </div>
          <h1 className="mt-5 text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.02]">
            Simple pricing now.
            <span style={{ color: "rgba(255,255,255,0.55)" }}> Pro expansion coming soon.</span>
          </h1>
          <p className="mt-5 text-base md:text-lg leading-relaxed" style={{ color: theme.textMuted }}>
            Start with the free workspace to connect accounts, publish, manage messages and build automations. Pro will add higher limits, deeper analytics, and team-focused features.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <section
            className="rounded-3xl p-6 md:p-7"
            style={{
              background: `linear-gradient(180deg, ${theme.panel}, rgba(21,22,32,0.88))`,
              border: `1px solid ${theme.border}`,
              boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: theme.cyan }}>
                  Free
                </p>
                <h2 className="mt-2 text-2xl font-black">Start Free</h2>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: theme.textMuted }}>
                  Best for solo creators and early testing while you set up your workflow.
                </p>
              </div>
              <div
                className="rounded-2xl px-4 py-3 text-right"
                style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.16)" }}
              >
                <p className="text-3xl font-black" style={{ color: "rgba(255,255,255,0.96)" }}>$0</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>to start</p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {freePlan.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "rgba(132,204,22,0.14)", border: "1px solid rgba(132,204,22,0.2)" }}
                  >
                    <Check className="h-3 w-3" style={{ color: theme.lime }} />
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.76)" }}>
                    {item}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <Link
                href="/login"
                className="group inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
                style={{
                  background: "linear-gradient(135deg, #f59e0b 0%, #fb7185 55%, #22d3ee 100%)",
                  boxShadow: "0 8px 26px rgba(34,211,238,0.12)",
                }}
              >
                Start for Free
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link
                href="/#faq"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.78)",
                }}
              >
                Read FAQ
              </Link>
            </div>
          </section>

          <section
            className="rounded-3xl p-6 md:p-7 relative overflow-hidden"
            style={{
              background: "linear-gradient(180deg, rgba(18,19,26,0.92), rgba(11,11,15,0.95))",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 18px 44px rgba(0,0,0,0.22)",
            }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 85% 10%, rgba(251,113,133,0.12), transparent 45%), radial-gradient(circle at 10% 90%, rgba(34,211,238,0.10), transparent 45%)",
              }}
            />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: theme.amber }}>
                    Pro
                  </p>
                  <h2 className="mt-2 text-2xl font-black">Pro Plan</h2>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: theme.textMuted }}>
                    For teams that need higher limits, deeper analytics and more operational controls.
                  </p>
                </div>
                <span
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)", color: "rgba(255,255,255,0.85)" }}
                >
                  <Zap className="h-3.5 w-3.5" style={{ color: theme.amber }} />
                  Coming Soon
                </span>
              </div>

              <div className="mt-6 space-y-3">
                {proPlan.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ background: "rgba(251,113,133,0.12)", border: "1px solid rgba(251,113,133,0.18)" }}
                    >
                      <Check className="h-3 w-3" style={{ color: theme.coral }} />
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.74)" }}>
                      {item}
                    </p>
                  </div>
                ))}
              </div>

              <div
                className="mt-7 rounded-2xl p-4"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
                  Pricing details will be announced after limit tuning.
                </p>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                  We are validating automation and analytics usage patterns first so the Pro plan matches real workload needs.
                </p>
              </div>
            </div>
          </section>
        </div>

        <div
          className="mt-8 rounded-2xl p-5 md:p-6"
          style={{
            background: theme.bgSoft,
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "rgba(255,255,255,0.38)" }}>
                Notes
              </p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.62)" }}>
                Platform permissions and analytics coverage can vary by Meta endpoint and media type. The dashboard shows partial-data warnings when metrics are unavailable so teams can operate with clear expectations.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {["Instagram + Facebook", "Automation Templates", "Brand Profile", "AI Workflows"].map((tag, i) => (
                <span
                  key={tag}
                  className="rounded-full px-3 py-1.5 text-xs font-medium"
                  style={{
                    background: i % 2 ? "rgba(34,211,238,0.06)" : "rgba(245,158,11,0.06)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.74)",
                  }}
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
