'use client'

import { AlertCircle, Database } from 'lucide-react'
import type { AssistantContextReceipt } from '@/lib/assistant/context-types'

interface AssistantContextReceiptProps {
  receipt?: AssistantContextReceipt
}

export function AssistantContextReceiptView({ receipt }: AssistantContextReceiptProps) {
  if (!receipt) return null

  return (
    <div className="mt-2 flex max-w-full flex-wrap items-center gap-1.5 text-[11px] text-white/38">
      <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-white/8 bg-white/5 px-2 py-1">
        <Database className="h-3 w-3 shrink-0 text-cyan-200/70" />
        <span className="min-w-0 break-words">{receipt.label}</span>
      </span>
      {receipt.analyticsSyncReason && (
        <span className="max-w-full min-w-0 break-words rounded-full border border-white/8 bg-white/5 px-2 py-1">
          analytics: {receipt.analyticsSyncReason}
        </span>
      )}
      {receipt.warnings.slice(0, 2).map((warning) => (
        <span key={warning} className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-amber-400/15 bg-amber-400/10 px-2 py-1 text-amber-100/70">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">{warning}</span>
        </span>
      ))}
    </div>
  )
}
