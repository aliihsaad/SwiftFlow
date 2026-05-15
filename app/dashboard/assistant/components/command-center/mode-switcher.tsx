'use client'

import type { AssistantMode, AssistantModeMeta } from '../../assistant-types'
import { cn } from '@/lib/utils'
import { ASSISTANT_HORIZONTAL_SCROLL_CLASS, ASSISTANT_TOUCH_PILL_BUTTON_CLASS } from '@/lib/assistant/mobile-control-layout'

interface AssistantModeSwitcherProps {
  modes: AssistantModeMeta[]
  selectedMode: AssistantMode
  onModeChange: (mode: AssistantMode) => void
  compact?: boolean
}

export function AssistantModeSwitcher({
  modes,
  selectedMode,
  onModeChange,
  compact = false,
}: AssistantModeSwitcherProps) {
  return (
    <div className={cn('flex gap-1.5 pb-1', ASSISTANT_HORIZONTAL_SCROLL_CLASS)}>
      {modes.map((mode) => {
        const Icon = mode.icon
        const active = selectedMode === mode.id

        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onModeChange(mode.id)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors',
              ASSISTANT_TOUCH_PILL_BUTTON_CLASS,
              active
                ? 'border-cyan-400/35 bg-cyan-400/12 text-cyan-100'
                : 'border-white/8 bg-white/5 text-white/55 hover:bg-white/8 hover:text-white/80',
            )}
            title={mode.description}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{compact ? mode.shortLabel : mode.label}</span>
          </button>
        )
      })}
    </div>
  )
}
