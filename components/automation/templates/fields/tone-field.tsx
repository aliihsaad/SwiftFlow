"use client"

const TONES: Array<{ value: 'friendly' | 'professional' | 'playful' | 'empathetic' | 'sales'; label: string }> = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'playful', label: 'Playful' },
  { value: 'empathetic', label: 'Empathetic' },
  { value: 'sales', label: 'Sales' },
]

export function ToneField({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (next: string) => void
  label: string
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-white/80">{label}</label>
      <div className="flex flex-wrap gap-2">
        {TONES.map((tone) => {
          const isActive = value === tone.value
          return (
            <button
              key={tone.value}
              type="button"
              onClick={() => onChange(tone.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-300/40'
                  : 'bg-white/[0.04] text-white/70 hover:bg-white/[0.08]'
              }`}
            >
              {tone.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
