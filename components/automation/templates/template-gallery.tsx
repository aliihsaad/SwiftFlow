// components/automation/templates/template-gallery.tsx
"use client"

import { Sparkles, Workflow } from 'lucide-react'
import { AUTOMATION_TEMPLATES } from '@/lib/automation-templates'
import type { AutomationTemplateDefinition } from '@/lib/automation-templates'

const CATEGORY_ORDER: AutomationTemplateDefinition['category'][] = [
  'comments',
  'messages',
  'mentions',
  'growth',
]
const CATEGORY_LABEL: Record<AutomationTemplateDefinition['category'], string> = {
  comments: 'Comments',
  messages: 'Messages',
  mentions: 'Mentions',
  growth: 'Growth',
}

export function TemplateGallery({
  onPickTemplate,
  onAdvanced,
  disabled,
}: {
  onPickTemplate: (template: AutomationTemplateDefinition) => void
  onAdvanced: () => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white/85">Pick a template</h2>
          <p className="text-sm text-white/45">
            Each template is a single-screen setup. Saved automations start as drafts.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdvanced}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Workflow className="h-3.5 w-3.5" />
          Advanced canvas
        </button>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const templates = AUTOMATION_TEMPLATES.filter((t) => t.category === category)
        if (templates.length === 0) return null
        return (
          <section key={category} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              {CATEGORY_LABEL[category]}
            </h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => {
                const Icon = template.icon || Sparkles
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onPickTemplate(template)}
                    disabled={disabled}
                    className="flex flex-col items-start gap-2 rounded-xl bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 ring-1 ring-cyan-300/20">
                      <Icon className="h-4 w-4 text-cyan-200" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white/85">{template.name}</p>
                      <p className="mt-1 text-xs text-white/50">{template.description}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {template.supportedPlatforms.map((p) => (
                        <span
                          key={p}
                          className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/50"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
