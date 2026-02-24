"use client"

import { LucideIcon } from "lucide-react"

interface AutomationCardProps {
    icon: LucideIcon
    title: string
    description: string
    onClick: () => void
    badge?: string
    disabled?: boolean
}

export function AutomationCard({
    icon: Icon,
    title,
    description,
    onClick,
    badge,
    disabled = false
}: AutomationCardProps) {
    return (
        <button
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            className="group relative overflow-hidden rounded-xl text-left w-full transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
                background: '#151620',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            }}
            onMouseEnter={(e) => {
                if (!disabled) {
                    e.currentTarget.style.border = '1px solid rgba(56,189,248,0.22)'
                    e.currentTarget.style.boxShadow = '0 12px 32px rgba(56,189,248,0.10)'
                }
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)'
            }}
        >
            {/* Ambient glow */}
            <div
                className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-0 group-hover:opacity-25 transition-opacity duration-300"
                style={{ background: '#38bdf8' }}
            />

            <div className="p-5 sm:p-6 flex items-start gap-4">
                <div
                    className="p-3 rounded-xl shrink-0 transition-all duration-200 group-hover:scale-110"
                    style={{ background: 'rgba(56,189,248,0.10)', border: '1px solid rgba(56,189,248,0.15)' }}
                >
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: '#67e8f9' }} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="font-semibold text-sm sm:text-base" style={{ color: 'rgba(255,255,255,0.85)' }}>
                            {title}
                        </h3>
                        {badge && (
                            <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                                style={{ background: 'rgba(245,158,11,0.10)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.2)' }}
                            >
                                {badge}
                            </span>
                        )}
                    </div>
                    <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {description}
                    </p>
                </div>
            </div>

            {/* Bottom hover bar */}
            <div
                className="absolute bottom-0 left-0 right-0 h-0.5 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"
                style={{ background: 'linear-gradient(90deg, #38bdf8, #fb7185)' }}
            />
        </button>
    )
}
