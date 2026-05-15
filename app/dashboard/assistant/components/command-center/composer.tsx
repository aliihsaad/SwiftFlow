'use client'

/* eslint-disable @next/next/no-img-element */

import type { ChangeEvent, RefObject } from 'react'
import { ArrowUp, Paperclip, X } from 'lucide-react'
import type { AssistantMode, MessageImage } from '../../assistant-types'
import { ASSISTANT_THEME } from '../../assistant-config'
import type { AssistantQuickAction } from '@/lib/assistant/quick-actions'
import {
  ASSISTANT_HORIZONTAL_SCROLL_CLASS,
  ASSISTANT_TOUCH_ICON_BUTTON_CLASS,
} from '@/lib/assistant/mobile-control-layout'
import { cn } from '@/lib/utils'
import { AssistantQuickActions } from './quick-actions'

interface AssistantComposerProps {
  input: string
  selectedMode: AssistantMode
  quickActions: AssistantQuickAction[]
  pendingImages: MessageImage[]
  isLoading: boolean
  activeActionId?: string | null
  isMobile?: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  onInputChange: (value: string) => void
  onSend: () => void
  onQuickAction: (action: AssistantQuickAction) => void
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void
  onRemoveImage: (index: number) => void
}

function placeholderForMode(mode: AssistantMode): string {
  switch (mode) {
    case 'create':
      return 'Create a post, image, carousel, or idea...'
    case 'improve':
      return 'Paste a draft to improve...'
    case 'analyze':
      return 'Ask about performance or timing...'
    case 'operate':
      return 'Ask about posts, schedules, or automations...'
    case 'ask':
    default:
      return 'Ask me anything...'
  }
}

export function AssistantComposer({
  input,
  selectedMode,
  quickActions,
  pendingImages,
  isLoading,
  activeActionId,
  isMobile,
  fileInputRef,
  onInputChange,
  onSend,
  onQuickAction,
  onFileSelect,
  onRemoveImage,
}: AssistantComposerProps) {
  return (
    <div
      className={cn(
        'flex-none border-t border-white/6 bg-[#151620]/90 p-3 backdrop-blur sm:p-4',
        isMobile && 'px-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2',
      )}
    >
      <div className={cn('mx-auto max-w-3xl', isMobile && 'max-w-none')}>
        {pendingImages.length > 0 && (
          <div className={cn('mb-2 flex gap-2 px-1', isMobile && ASSISTANT_HORIZONTAL_SCROLL_CLASS)}>
            {pendingImages.map((img, index) => (
              <div key={`${img.name}-${index}`} className="group relative shrink-0">
                <img
                  src={`data:${img.mimeType};base64,${img.base64}`}
                  alt={img.name}
                  className="h-14 w-14 rounded-lg border border-white/10 object-cover sm:h-16 sm:w-16"
                />
                <button
                  type="button"
                  onClick={() => onRemoveImage(index)}
                  className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500/90 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label={`Remove ${img.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={cn('mb-2 flex items-center gap-2 px-1', isMobile && 'justify-between')}>
          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold capitalize text-cyan-100">
            {selectedMode}
          </span>
        </div>

        <div className={cn('mb-2', isMobile && '-mx-1')}>
          <AssistantQuickActions
            actions={quickActions}
            disabled={isLoading}
            activeActionId={activeActionId}
            onAction={onQuickAction}
          />
        </div>

        <div className="relative flex items-center">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            multiple
            className="hidden"
            onChange={onFileSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || pendingImages.length >= 3}
            className={cn('absolute left-1 flex items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 disabled:opacity-30', ASSISTANT_TOUCH_ICON_BUTTON_CLASS)}
            title="Attach image"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) onSend()
            }}
            placeholder={placeholderForMode(selectedMode)}
            className={cn(
              'w-full rounded-xl py-3.5 pl-12 pr-14 text-sm text-white/85 outline-none transition-colors',
              isMobile && 'min-h-[48px] text-[16px]',
            )}
            style={{
              background: ASSISTANT_THEME.shellAlt,
              border: `1px solid ${ASSISTANT_THEME.border}`,
            }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={isLoading || (!input.trim() && pendingImages.length === 0)}
            className={cn('absolute right-1 flex items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-rose-400 transition-opacity active:scale-95 disabled:opacity-30', ASSISTANT_TOUCH_ICON_BUTTON_CLASS)}
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4 text-white" />
          </button>
        </div>
        <p className={cn('mt-2 text-center text-[11px] text-white/25', isMobile && 'text-[10px]')}>
          AI can make mistakes. Check important info.
        </p>
      </div>
    </div>
  )
}
