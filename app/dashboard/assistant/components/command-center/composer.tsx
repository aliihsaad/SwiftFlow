'use client'

import type { ChangeEvent, RefObject } from 'react'
import { ArrowUp, Paperclip, X } from 'lucide-react'
import type { AssistantMode, MessageImage } from '../../assistant-types'
import { ASSISTANT_THEME } from '../../assistant-config'
import type { AssistantQuickAction } from '@/lib/assistant/quick-actions'
import { AssistantQuickActions } from './quick-actions'

interface AssistantComposerProps {
  input: string
  selectedMode: AssistantMode
  quickActions: AssistantQuickAction[]
  pendingImages: MessageImage[]
  isLoading: boolean
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
  fileInputRef,
  onInputChange,
  onSend,
  onQuickAction,
  onFileSelect,
  onRemoveImage,
}: AssistantComposerProps) {
  return (
    <div className="flex-none border-t border-white/6 bg-[#151620]/90 p-3 backdrop-blur sm:p-4">
      <div className="mx-auto max-w-3xl">
        {pendingImages.length > 0 && (
          <div className="mb-2 flex gap-2 px-1">
            {pendingImages.map((img, index) => (
              <div key={`${img.name}-${index}`} className="group relative">
                <img
                  src={`data:${img.mimeType};base64,${img.base64}`}
                  alt={img.name}
                  className="h-14 w-14 rounded-lg border border-white/10 object-cover sm:h-16 sm:w-16"
                />
                <button
                  type="button"
                  onClick={() => onRemoveImage(index)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/90 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold capitalize text-cyan-100">
            {selectedMode}
          </span>
        </div>

        <div className="mb-2">
          <AssistantQuickActions actions={quickActions} disabled={isLoading} onAction={onQuickAction} />
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
            className="absolute left-2 flex h-8 w-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 disabled:opacity-30"
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
            className="w-full rounded-xl py-3.5 pl-11 pr-14 text-sm text-white/85 outline-none transition-colors"
            style={{
              background: ASSISTANT_THEME.shellAlt,
              border: `1px solid ${ASSISTANT_THEME.border}`,
            }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={isLoading || (!input.trim() && pendingImages.length === 0)}
            className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-rose-400 transition-opacity active:scale-95 disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4 text-white" />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-white/25">
          AI can make mistakes. Check important info.
        </p>
      </div>
    </div>
  )
}
