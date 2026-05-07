"use client"

import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import type {
  AutomationTemplateDefinition,
  TemplateField,
  TemplateFormValues,
} from '@/lib/automation-templates'
import { ToneField } from './fields/tone-field'
import { KeywordsField } from './fields/keywords-field'
import { SocialAccountField } from './fields/social-account-field'
import { PostOrAllField } from './fields/post-or-all-field'

function initialValuesFor(template: AutomationTemplateDefinition): TemplateFormValues {
  const initial: TemplateFormValues = {}
  for (const field of template.fields) {
    if (field.defaultValue !== undefined) initial[field.id] = field.defaultValue
    else if (field.type === 'switch') initial[field.id] = false
    else if (field.type === 'keywords') initial[field.id] = []
    else if (field.type === 'post_or_all') initial[field.id] = 'all'
    else initial[field.id] = ''
  }
  return initial
}

function isFieldVisible(field: TemplateField, values: TemplateFormValues): boolean {
  if (!field.showWhen) return true
  return values[field.showWhen.fieldId] === field.showWhen.equals
}

function isFormValid(template: AutomationTemplateDefinition, values: TemplateFormValues): boolean {
  for (const field of template.fields) {
    if (!isFieldVisible(field, values)) continue
    if (!field.required) continue
    const v = values[field.id]
    if (v === undefined || v === null || v === '') return false
    if (Array.isArray(v) && v.length === 0) return false
  }
  return true
}

export function TemplateFormModal({
  open,
  template,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  template: AutomationTemplateDefinition | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [values, setValues] = useState<TemplateFormValues>(() =>
    template ? initialValuesFor(template) : {},
  )
  const [name, setName] = useState<string>(() =>
    template ? template.defaultName(values) : '',
  )
  const [isSaving, setIsSaving] = useState(false)

  const visibleFields = useMemo(
    () => (template ? template.fields.filter((f) => isFieldVisible(f, values)) : []),
    [template, values],
  )
  const valid = template ? isFormValid(template, values) && name.trim().length > 0 : false

  // Re-derive default name when key fields change.
  // (Keep it simple: only update if user hasn't manually edited yet.)
  const handleField = (id: string, next: unknown) => {
    setValues((prev) => ({ ...prev, [id]: next }))
  }

  const handleSave = async () => {
    if (!template || !valid) return
    setIsSaving(true)
    try {
      const graph = template.buildGraphFromForm(values)
      const triggerNode = graph.nodes.find((n) => n.data?.type?.startsWith('trigger_'))
      const config = triggerNode?.data?.config as Record<string, unknown> | undefined
      const body: Record<string, unknown> = {
        workflow_graph: graph,
        editor_version: 'canvas',
        name: name.trim(),
        is_active: false,
        social_account_id: config?.social_account_id || values.social_account_id || '',
      }
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to save template')
      }
      toast({ title: 'Template saved', description: `"${name}" was saved as a draft.` })
      onSaved()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (!template) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{template.name}</DialogTitle>
        <DialogDescription>{template.description}</DialogDescription>

        <div className="mt-3 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-white/80">Automation name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-white/[0.04] text-white placeholder:text-white/30"
            />
          </div>

          {visibleFields.map((field) => {
            switch (field.type) {
              case 'social_account':
                return (
                  <SocialAccountField
                    key={field.id}
                    value={String(values[field.id] || '')}
                    onChange={(id) => handleField(field.id, id)}
                    platform={field.platform || 'instagram'}
                    label={field.label}
                    required={field.required}
                  />
                )
              case 'post_or_all':
                return (
                  <PostOrAllField
                    key={field.id}
                    socialAccountId={String(values.social_account_id || '')}
                    selection={String(values[field.id] || 'all')}
                    onChange={({ selection, postId }) => {
                      setValues((prev) => ({
                        ...prev,
                        [field.id]: selection,
                        post_id: postId,
                      }))
                    }}
                    label={field.label}
                    required={field.required}
                  />
                )
              case 'text':
              case 'url':
                return (
                  <div key={field.id} className="space-y-2">
                    <Label className="text-sm font-semibold text-white/80">
                      {field.label}
                      {field.required && <span className="ml-1 text-rose-300">*</span>}
                    </Label>
                    <Input
                      value={String(values[field.id] || '')}
                      onChange={(e) => handleField(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      type={field.type === 'url' ? 'url' : 'text'}
                      className="bg-white/[0.04] text-white placeholder:text-white/30"
                    />
                    {field.helpText && <p className="text-xs text-white/45">{field.helpText}</p>}
                  </div>
                )
              case 'textarea':
                return (
                  <div key={field.id} className="space-y-2">
                    <Label className="text-sm font-semibold text-white/80">
                      {field.label}
                      {field.required && <span className="ml-1 text-rose-300">*</span>}
                    </Label>
                    <Textarea
                      value={String(values[field.id] || '')}
                      onChange={(e) => handleField(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      className="bg-white/[0.04] text-white placeholder:text-white/30 min-h-[88px]"
                    />
                  </div>
                )
              case 'switch':
                return (
                  <div key={field.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label className="text-sm font-semibold text-white/80">{field.label}</Label>
                      {field.helpText && (
                        <p className="text-xs text-white/45">{field.helpText}</p>
                      )}
                    </div>
                    <Switch
                      checked={Boolean(values[field.id])}
                      onCheckedChange={(checked) => handleField(field.id, checked)}
                    />
                  </div>
                )
              case 'tone':
                return (
                  <ToneField
                    key={field.id}
                    value={String(values[field.id] || 'friendly')}
                    onChange={(t) => handleField(field.id, t)}
                    label={field.label}
                  />
                )
              case 'keywords':
                return (
                  <KeywordsField
                    key={field.id}
                    value={Array.isArray(values[field.id]) ? (values[field.id] as string[]) : []}
                    onChange={(next) => handleField(field.id, next)}
                    label={field.label}
                    helpText={field.helpText}
                  />
                )
              default:
                return null
            }
          })}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!valid || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              'Save Draft'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
