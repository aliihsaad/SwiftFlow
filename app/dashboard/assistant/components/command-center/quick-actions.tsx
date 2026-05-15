'use client'

import { useState } from 'react'
import {
  BarChart3,
  CalendarClock,
  FileText,
  Image as ImageIcon,
  Images,
  Lightbulb,
  MessageSquareText,
  PenLine,
  Sparkles,
  WandSparkles,
  Zap,
} from 'lucide-react'
import {
  splitAssistantQuickActions,
  type AssistantQuickAction,
  type AssistantQuickActionTone,
} from '@/lib/assistant/quick-actions'

interface AssistantQuickActionsProps {
  actions: AssistantQuickAction[]
  disabled?: boolean
  compact?: boolean
  activeActionId?: string | null
  onAction: (action: AssistantQuickAction) => void
}

const iconByAction: Record<string, typeof Sparkles> = {
  'create-post-idea': Lightbulb,
  'create-carousel': Images,
  'create-image': ImageIcon,
  'schedule-draft': CalendarClock,
  'improve-shorter': MessageSquareText,
  'improve-hook': WandSparkles,
  'improve-voice': Sparkles,
  'improve-cta': Zap,
  'analyze-recent-performance': BarChart3,
  'analyze-best-time': CalendarClock,
  'analyze-top-posts': FileText,
  'analyze-content-gaps': Lightbulb,
  'operate-drafts': FileText,
  'operate-scheduled': CalendarClock,
  'operate-automations': Zap,
  'operate-sync-analytics': BarChart3,
  'ask-explain': MessageSquareText,
  'ask-setup': WandSparkles,
  'ask-capabilities': Sparkles,
  'generate-post': PenLine,
  'make-carousel': Images,
  'start-draft': FileText,
}

const toneClasses: Record<AssistantQuickActionTone, string> = {
  cyan: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-50 hover:bg-cyan-300/15',
  rose: 'border-rose-300/20 bg-rose-300/10 text-rose-50 hover:bg-rose-300/15',
  amber: 'border-amber-300/20 bg-amber-300/10 text-amber-50 hover:bg-amber-300/15',
  emerald: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-50 hover:bg-emerald-300/15',
  violet: 'border-violet-300/20 bg-violet-300/10 text-violet-50 hover:bg-violet-300/15',
}

export function AssistantQuickActions({ actions, disabled, compact, activeActionId, onAction }: AssistantQuickActionsProps) {
  const [expandedSignature, setExpandedSignature] = useState<string | null>(null)
  const actionSignature = actions.map((action) => action.id).join('|')

  if (!actions.length) return null

  const grouped = splitAssistantQuickActions(actions)
  const showMore = expandedSignature === actionSignature
  const visibleActions = showMore ? [...grouped.primary, ...grouped.secondary] : grouped.primary
  const isBusy = Boolean(activeActionId)

  return (
    <div className={`flex gap-2 overflow-x-auto pb-1 ${compact ? 'max-w-full' : 'px-1'}`}>
      {visibleActions.map((action) => {
        const Icon = iconByAction[action.id] || Sparkles
        const isActive = activeActionId === action.id
        return (
          <button
            key={action.id}
            type="button"
            disabled={disabled || (isBusy && !isActive)}
            onClick={() => onAction(action)}
            title={action.guidance || action.prompt || action.label}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${toneClasses[action.tone]}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {isActive ? action.loadingLabel : action.label}
          </button>
        )
      })}
      {grouped.secondary.length > 0 && !showMore && (
        <button
          type="button"
          disabled={disabled || isBusy}
          onClick={() => setExpandedSignature(actionSignature)}
          className="inline-flex h-8 shrink-0 items-center rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs font-semibold text-white/55 transition hover:bg-white/8 hover:text-white/75 disabled:cursor-not-allowed disabled:opacity-45"
        >
          More
        </button>
      )}
    </div>
  )
}
