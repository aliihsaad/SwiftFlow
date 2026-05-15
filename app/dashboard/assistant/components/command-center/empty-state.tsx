'use client'

import { Bot } from 'lucide-react'
import type { AssistantQuickStart } from '../../assistant-types'
import { cn } from '@/lib/utils'

interface AssistantEmptyStateProps {
  quickStarts: AssistantQuickStart[]
  onQuickStart: (quickStart: AssistantQuickStart) => void
  isMobile?: boolean
}

export function AssistantEmptyState({ quickStarts, onQuickStart, isMobile }: AssistantEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[58vh] flex-col items-center justify-center gap-8 px-2 py-8 animate-in fade-in zoom-in duration-500',
        isMobile && 'min-h-[44vh] items-stretch justify-start gap-4 px-0 py-4',
      )}
    >
      <div className="space-y-3 text-center">
        <div className={cn(
          'mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-rose-400 shadow-[0_0_40px_rgba(56,189,248,0.22)]',
          isMobile && 'mb-3 h-11 w-11 rounded-lg',
        )}>
          <Bot className={cn('h-7 w-7 text-white', isMobile && 'h-5 w-5')} />
        </div>
        <h1 className={cn('text-2xl font-bold tracking-normal text-white/90 sm:text-3xl', isMobile && 'text-xl')}>
          AI Command Center
        </h1>
        <p className={cn('max-w-md text-sm text-white/45 sm:text-base', isMobile && 'mx-auto max-w-xs text-xs')}>
          Create, improve, analyze, and operate your social media workspace from one focused assistant.
        </p>
      </div>

      <div className={cn('grid w-full max-w-4xl grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3', isMobile && 'max-w-none')}>
        {quickStarts.map((item) => {
          const Icon = item.icon

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onQuickStart(item)}
              className={cn(
                'group flex min-h-[82px] items-center gap-3 rounded-lg border border-white/8 bg-[#1b1d28] p-3 text-left transition-colors hover:border-cyan-400/25 hover:bg-white/6',
                isMobile && 'min-h-[68px] p-2.5',
              )}
            >
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-400/12 text-cyan-200', isMobile && 'h-9 w-9')}>
                <Icon className={cn('h-5 w-5', isMobile && 'h-4 w-4')} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white/85">{item.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-white/38">{item.description}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
