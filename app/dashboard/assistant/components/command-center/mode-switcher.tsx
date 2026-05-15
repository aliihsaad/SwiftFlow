'use client'

import type { AssistantMode, AssistantModeMeta } from '../../assistant-types'
import { cn } from '@/lib/utils'
import { ASSISTANT_MODE_GRID_CLASS, ASSISTANT_TOUCH_PILL_BUTTON_CLASS } from '@/lib/assistant/mobile-control-layout'

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
    <div className={ASSISTANT_MODE_GRID_CLASS}>
      {modes.map((mode) => {
        const Icon = mode.icon
        const active = selectedMode === mode.id

        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onModeChange(mode.id)}
            className={cn(
              'flex items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-semibold leading-none transition-colors sm:shrink-0 sm:gap-2 sm:px-3 sm:text-xs',
              ASSISTANT_TOUCH_PILL_BUTTON_CLASS,
              active
                ? 'border-cyan-400/35 bg-cyan-400/12 text-cyan-100'
                : 'border-white/8 bg-white/5 text-white/55 hover:bg-white/8 hover:text-white/80',
            )}
            title={mode.description}
          >
            <Icon className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
            <span className="min-w-0 truncate">{compact ? mode.shortLabel : mode.label}</span>
          </button>
        )
      })}
    </div>
  )
}
