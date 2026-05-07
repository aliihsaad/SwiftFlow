"use client"

import { Instagram, Facebook } from 'lucide-react'
import { Label } from '@/components/ui/label'

const PLATFORMS: Array<{
  value: 'instagram' | 'facebook'
  label: string
  Icon: typeof Instagram
}> = [
  { value: 'instagram', label: 'Instagram', Icon: Instagram },
  { value: 'facebook', label: 'Facebook', Icon: Facebook },
]

export function PlatformField({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (next: 'instagram' | 'facebook') => void
  label: string
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-white/80">{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        {PLATFORMS.map(({ value: v, label: l, Icon }) => {
          const isActive = value === v
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-300/40'
                  : 'bg-white/[0.04] text-white/70 hover:bg-white/[0.08]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {l}
            </button>
          )
        })}
      </div>
    </div>
  )
}
