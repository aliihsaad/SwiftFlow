'use client'

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
import type { AssistantQuickAction, AssistantQuickActionTone } from '@/lib/assistant/quick-actions'

interface AssistantQuickActionsProps {
  actions: AssistantQuickAction[]
  disabled?: boolean
  compact?: boolean
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

export function AssistantQuickActions({ actions, disabled, compact, onAction }: AssistantQuickActionsProps) {
  if (!actions.length) return null

  return (
    <div className={`flex gap-2 overflow-x-auto pb-1 ${compact ? 'max-w-full' : 'px-1'}`}>
      {actions.map((action) => {
        const Icon = iconByAction[action.id] || Sparkles
        return (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            onClick={() => onAction(action)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${toneClasses[action.tone]}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {action.label}
          </button>
        )
      })}
    </div>
  )
}
