'use client'

import type { AssistantMode, AssistantModeMeta } from '../../assistant-types'
import { cn } from '@/lib/utils'

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
    <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {modes.map((mode) => {
        const Icon = mode.icon
        const active = selectedMode === mode.id

        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onModeChange(mode.id)}
            className={cn(
              'flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors',
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
