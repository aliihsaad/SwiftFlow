'use client'

import {
  BarChart3,
  Bookmark,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  Heart,
  Lightbulb,
  MessageCircle,
  Share2,
  Sparkles,
} from 'lucide-react'
import type { AssistantContextReceipt } from '@/lib/assistant/context-types'
import { buildAssistantBriefing, stripAssistantMarkdown } from '@/lib/assistant/response-briefing'
import { buildContextualAssistantActions, type AssistantQuickAction } from '@/lib/assistant/quick-actions'
import { AssistantQuickActions } from './quick-actions'

interface AssistantResponseViewProps {
  content: string
  contextReceipt?: AssistantContextReceipt
  onCopy: (text: string) => void
  onQuickAction?: (action: AssistantQuickAction) => void
}

const metricIcon = {
  Views: Eye,
  Likes: Heart,
  Comments: MessageCircle,
  Shares: Share2,
  Saves: Bookmark,
  Posts: BarChart3,
  Growth: Sparkles,
}

const metricTone = {
  Views: {
    tile: 'border-cyan-300/18 bg-cyan-300/[0.07]',
    icon: 'text-cyan-200',
    bar: 'from-cyan-300 to-sky-400',
  },
  Likes: {
    tile: 'border-rose-300/18 bg-rose-300/[0.07]',
    icon: 'text-rose-200',
    bar: 'from-rose-300 to-pink-400',
  },
  Comments: {
    tile: 'border-violet-300/18 bg-violet-300/[0.07]',
    icon: 'text-violet-200',
    bar: 'from-violet-300 to-fuchsia-400',
  },
  Shares: {
    tile: 'border-emerald-300/18 bg-emerald-300/[0.07]',
    icon: 'text-emerald-200',
    bar: 'from-emerald-300 to-teal-400',
  },
  Saves: {
    tile: 'border-amber-300/18 bg-amber-300/[0.07]',
    icon: 'text-amber-200',
    bar: 'from-amber-300 to-orange-400',
  },
  Posts: {
    tile: 'border-slate-300/14 bg-white/[0.045]',
    icon: 'text-white/60',
    bar: 'from-slate-300 to-slate-500',
  },
  Growth: {
    tile: 'border-emerald-300/18 bg-emerald-300/[0.07]',
    icon: 'text-emerald-200',
    bar: 'from-emerald-300 to-lime-400',
  },
}

const sectionTone = {
  'What happened': 'border-cyan-300/14 bg-cyan-300/[0.045]',
  'Post next': 'border-violet-300/14 bg-violet-300/[0.05]',
  Timing: 'border-emerald-300/14 bg-emerald-300/[0.045]',
  Actions: 'border-amber-300/16 bg-amber-300/[0.045]',
  Cadence: 'border-emerald-300/14 bg-emerald-300/[0.045]',
  Hashtags: 'border-rose-300/14 bg-rose-300/[0.045]',
  Distribution: 'border-cyan-300/14 bg-cyan-300/[0.045]',
}

function parseMetricValue(value: string): number {
  const normalized = value.toLowerCase().replace(/,/g, '').trim()
  const match = normalized.match(/^([\d.]+)\s*([kmb%])?$/)
  if (!match) return 0

  const base = Number(match[1])
  if (!Number.isFinite(base)) return 0
  if (match[2] === 'k') return base * 1000
  if (match[2] === 'm') return base * 1000000
  if (match[2] === 'b') return base * 1000000000
  return base
}

function isErrorResponse(content: string) {
  return /^error:/i.test(content.trim())
}

function AssistantProseBubble({ content, onCopy }: Pick<AssistantResponseViewProps, 'content' | 'onCopy'>) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => stripAssistantMarkdown(paragraph))
    .filter(Boolean)

  return (
    <div className="group relative max-w-full rounded-2xl rounded-bl px-4 py-3 text-sm leading-relaxed text-white/80"
      style={{
        background: 'rgba(23,25,36,0.96)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="space-y-2">
        {(paragraphs.length ? paragraphs : [stripAssistantMarkdown(content)]).map((paragraph) => (
          <p key={paragraph} className="break-words">
            {paragraph}
          </p>
        ))}
      </div>
      <button
        className="absolute -right-7 top-2 flex h-6 w-6 items-center justify-center rounded-md text-white/40 opacity-0 transition-opacity hover:text-white/70 group-hover:opacity-100"
        style={{ background: 'rgba(255,255,255,0.06)' }}
        onClick={() => onCopy(content)}
        aria-label="Copy assistant response"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  )
}

export function AssistantResponseView({ content, contextReceipt, onCopy, onQuickAction }: AssistantResponseViewProps) {
  if (isErrorResponse(content)) {
    return <AssistantProseBubble content={content} onCopy={onCopy} />
  }

  const briefing = buildAssistantBriefing(content)
  const hasStructuredContent = briefing.kind === 'analysis' && (briefing.metrics.length > 0 || briefing.sections.length > 0)
  const contextualActions = onQuickAction ? buildContextualAssistantActions(briefing) : []
  const metricMax = Math.max(...briefing.metrics.map((metric) => parseMetricValue(metric.value)), 1)
  const engagementMetrics = briefing.metrics.filter((metric) => ['Likes', 'Comments', 'Shares', 'Saves'].includes(metric.label))
  const engagementTotal = engagementMetrics.reduce((sum, metric) => sum + parseMetricValue(metric.value), 0)

  if (!hasStructuredContent) {
    return <AssistantProseBubble content={content} onCopy={onCopy} />
  }

  return (
    <article
      className="group relative w-full max-w-2xl overflow-hidden rounded-2xl rounded-bl border border-white/10 bg-[#171923] text-white shadow-[0_18px_50px_rgba(0,0,0,0.22)]"
    >
      <div className="border-b border-white/8 bg-gradient-to-r from-cyan-300/[0.08] via-violet-300/[0.045] to-rose-300/[0.06] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-400/12 text-cyan-200">
              <BarChart3 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-tight text-white">Performance briefing</h3>
              <p className="mt-0.5 text-[11px] text-white/42">
                {contextReceipt?.analyticsSyncReason
                  ? `Analytics ${contextReceipt.analyticsSyncReason.replace(/_/g, ' ')}`
                  : 'Scored from recent workspace signals'}
              </p>
            </div>
          </div>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/8 bg-white/5 text-white/45 transition hover:bg-white/8 hover:text-white/75"
            onClick={() => onCopy(content)}
            aria-label="Copy assistant response"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {briefing.metrics.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {briefing.metrics.slice(0, 5).map((metric) => {
              const Icon = metricIcon[metric.label as keyof typeof metricIcon] || BarChart3
              const tone = metricTone[metric.label as keyof typeof metricTone] || metricTone.Views
              const width = Math.max(8, Math.round((parseMetricValue(metric.value) / metricMax) * 100))
              return (
                <div key={metric.label} className={`min-w-0 rounded-lg border px-3 py-2 ${tone.tile}`}>
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/50">
                    <Icon className={`h-3.5 w-3.5 ${tone.icon}`} />
                    <span className="truncate">{metric.label}</span>
                  </div>
                  <div className="text-base font-semibold leading-none text-white">{metric.value}</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.24]">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${tone.bar}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {engagementTotal > 0 && (
          <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/55">Engagement mix</span>
              <span className="text-[11px] text-white/35">{Math.round(engagementTotal).toLocaleString()} signals</span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-black/[0.26]">
              {engagementMetrics.map((metric) => {
                const tone = metricTone[metric.label as keyof typeof metricTone] || metricTone.Views
                const width = Math.max(4, (parseMetricValue(metric.value) / engagementTotal) * 100)
                return (
                  <div
                    key={metric.label}
                    className={`h-full bg-gradient-to-r ${tone.bar}`}
                    style={{ width: `${width}%` }}
                    title={`${metric.label}: ${metric.value}`}
                  />
                )
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {engagementMetrics.map((metric) => {
                const tone = metricTone[metric.label as keyof typeof metricTone] || metricTone.Views
                return (
                  <span key={metric.label} className="inline-flex items-center gap-1 text-[11px] text-white/45">
                    <span className={`h-2 w-2 rounded-full bg-gradient-to-r ${tone.bar}`} />
                    {metric.label}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {briefing.summary && (
          <div className="rounded-lg border border-cyan-300/12 bg-cyan-300/[0.045] px-3 py-2.5 text-sm leading-relaxed text-cyan-50/82">
            {stripAssistantMarkdown(briefing.summary)}
          </div>
        )}

        {briefing.sections.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {briefing.sections.map((section) => {
              const Icon = section.title === 'Post next'
                ? Lightbulb
                : section.title === 'Timing'
                  ? Clock3
                  : CheckCircle2
              return (
                <section
                  key={section.title}
                  className={`min-w-0 rounded-lg border p-3 ${sectionTone[section.title as keyof typeof sectionTone] || 'border-white/8 bg-white/[0.03]'}`}
                >
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/62">
                    <Icon className="h-3.5 w-3.5 text-cyan-200/75" />
                    {section.title}
                  </div>
                  <ul className="space-y-1.5">
                    {section.items.slice(0, 4).map((item) => (
                      <li key={item} className="flex gap-2 text-sm leading-relaxed text-white/78">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cyan-200/70" />
                        <span className="min-w-0 break-words">{stripAssistantMarkdown(item)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}

        {contextualActions.length > 0 && onQuickAction && (
          <div className="rounded-lg border border-white/8 bg-black/[0.16] p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/52">Act on this</div>
            <AssistantQuickActions actions={contextualActions} compact onAction={onQuickAction} />
          </div>
        )}
      </div>
    </article>
  )
}
