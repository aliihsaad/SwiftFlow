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

interface AssistantResponseViewProps {
  content: string
  contextReceipt?: AssistantContextReceipt
  onCopy: (text: string) => void
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

export function AssistantResponseView({ content, contextReceipt, onCopy }: AssistantResponseViewProps) {
  if (isErrorResponse(content)) {
    return <AssistantProseBubble content={content} onCopy={onCopy} />
  }

  const briefing = buildAssistantBriefing(content)
  const hasStructuredContent = briefing.kind === 'analysis' && (briefing.metrics.length > 0 || briefing.sections.length > 0)

  if (!hasStructuredContent) {
    return <AssistantProseBubble content={content} onCopy={onCopy} />
  }

  return (
    <article
      className="group relative w-full max-w-2xl overflow-hidden rounded-2xl rounded-bl border border-white/10 bg-[#171923] text-white shadow-[0_18px_50px_rgba(0,0,0,0.22)]"
    >
      <div className="border-b border-white/8 bg-white/[0.025] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-400/12 text-cyan-200">
              <BarChart3 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-tight text-white">Performance briefing</h3>
              {contextReceipt?.analyticsSyncReason && (
                <p className="mt-0.5 text-[11px] text-white/42">
                  Analytics {contextReceipt.analyticsSyncReason.replace(/_/g, ' ')}
                </p>
              )}
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
              return (
                <div key={metric.label} className="min-w-0 rounded-lg border border-white/8 bg-white/[0.035] px-3 py-2">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/45">
                    <Icon className="h-3.5 w-3.5 text-cyan-200/70" />
                    <span className="truncate">{metric.label}</span>
                  </div>
                  <div className="text-base font-semibold leading-none text-white">{metric.value}</div>
                </div>
              )
            })}
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
                <section key={section.title} className="min-w-0 rounded-lg border border-white/8 bg-white/[0.03] p-3">
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
      </div>
    </article>
  )
}
