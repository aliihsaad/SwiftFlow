'use client'

import { AlertCircle, Database } from 'lucide-react'
import type { AssistantContextReceipt } from '@/lib/assistant/context-types'

interface AssistantContextReceiptProps {
  receipt?: AssistantContextReceipt
}

export function AssistantContextReceiptView({ receipt }: AssistantContextReceiptProps) {
  if (!receipt) return null

  return (
    <div className="mt-1.5 flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain text-[10px] text-white/38 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mt-2 md:flex-wrap md:gap-1.5 md:overflow-visible md:text-[11px]">
      <span className="inline-flex max-w-[75vw] shrink-0 items-center gap-1 rounded-full border border-white/8 bg-white/5 px-1.5 py-0.5 md:max-w-full md:px-2 md:py-1">
        <Database className="h-3 w-3 shrink-0 text-cyan-200/70" />
        <span className="min-w-0 truncate">{receipt.label}</span>
      </span>
      {receipt.analyticsSyncReason && (
        <span className="max-w-[75vw] shrink-0 truncate rounded-full border border-white/8 bg-white/5 px-1.5 py-0.5 md:max-w-full md:px-2 md:py-1">
          analytics: {receipt.analyticsSyncReason}
        </span>
      )}
      {receipt.warnings.slice(0, 2).map((warning) => (
        <span key={warning} className="inline-flex max-w-[75vw] shrink-0 items-center gap-1 rounded-full border border-amber-400/15 bg-amber-400/10 px-1.5 py-0.5 text-amber-100/70 md:max-w-full md:px-2 md:py-1">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="min-w-0 truncate">{warning}</span>
        </span>
      ))}
    </div>
  )
}
