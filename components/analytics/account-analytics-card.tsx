"use client"

import { Activity, Eye, Users } from "lucide-react"
import type { AccountAnalytics } from "@/types/analytics"

export function AccountAnalyticsCard({ data }: { data: AccountAnalytics }) {
    const stats = [
        { label: "Views in range", value: data.totalReach, icon: Eye, tone: "text-cyan-200 bg-cyan-300/[0.08] border-cyan-200/15" },
        { label: "Engagements", value: data.totalEngagement, icon: Activity, tone: "text-pink-200 bg-pink-300/[0.08] border-pink-200/15" },
        { label: "Current followers", value: data.followers, icon: Users, tone: "text-lime-200 bg-lime-300/[0.08] border-lime-200/15" },
    ]

    return (
        <section className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#10131c]" aria-labelledby="account-summary-title">
            <div className="border-b border-white/[0.06] px-5 py-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/28">Account snapshot</p>
                <h2 id="account-summary-title" className="mt-1 text-sm font-semibold text-white/82">Instagram totals</h2>
            </div>
            <div className="divide-y divide-white/[0.055] px-5">
                {stats.map(({ label, value, icon: Icon, tone }) => (
                    <div key={label} className="flex items-center gap-3 py-4">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${tone}`}>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs text-white/36">{label}</p>
                            <p className="mt-0.5 text-xl font-semibold tabular-nums text-white/86">{value.toLocaleString()}</p>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}
