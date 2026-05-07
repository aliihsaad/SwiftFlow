"use client"

import { useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function KeywordsField({
  value,
  onChange,
  label,
  helpText,
}: {
  value: string[]
  onChange: (next: string[]) => void
  label: string
  helpText?: string
}) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    if (value.includes(trimmed)) {
      setDraft('')
      return
    }
    onChange([...value, trimmed])
    setDraft('')
  }
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-white/80">{label}</Label>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          }}
          placeholder="Type a keyword and press Enter"
          className="bg-white/[0.04] text-white placeholder:text-white/30"
        />
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((keyword) => (
            <span
              key={keyword}
              className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/80"
            >
              {keyword}
              <button
                type="button"
                onClick={() => onChange(value.filter((k) => k !== keyword))}
                className="text-white/50 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {helpText && <p className="text-xs leading-relaxed text-white/45">{helpText}</p>}
    </div>
  )
}
