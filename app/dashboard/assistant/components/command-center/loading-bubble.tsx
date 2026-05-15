'use client'

import { Bot } from 'lucide-react'
import { ASSISTANT_THEME } from '../../assistant-config'
import { cn } from '@/lib/utils'

interface AssistantLoadingBubbleProps {
  isMobile?: boolean
}

export function AssistantLoadingBubble({ isMobile }: AssistantLoadingBubbleProps) {
  return (
    <div className={cn('flex gap-3', isMobile && 'gap-2 px-1')}>
      {!isMobile && (
        <div className="flex h-8 w-8 shrink-0 animate-pulse items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-rose-400">
          <Bot className="h-4 w-4 text-white" />
        </div>
      )}
      <div
        className={cn('flex items-center gap-1.5 rounded-2xl px-4 py-3', isMobile && 'rounded-xl')}
        style={{
          background: ASSISTANT_THEME.shellAlt,
          border: `1px solid ${ASSISTANT_THEME.borderSoft}`,
          borderBottomLeftRadius: '4px',
        }}
      >
        <div className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.3s]" style={{ background: ASSISTANT_THEME.cyan }} />
        <div className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.15s]" style={{ background: ASSISTANT_THEME.coral }} />
        <div className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: ASSISTANT_THEME.amber }} />
      </div>
    </div>
  )
}
