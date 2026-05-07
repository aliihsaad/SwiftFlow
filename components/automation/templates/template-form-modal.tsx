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
import { PostField } from './fields/post-field'
import { PlatformField } from './fields/platform-field'

function initialValuesFor(template: AutomationTemplateDefinition): TemplateFormValues {
  const initial: TemplateFormValues = {}
  for (const field of template.fields) {
    if (field.defaultValue !== undefined) initial[field.id] = field.defaultValue
    else if (field.type === 'switch') initial[field.id] = false
    else if (field.type === 'keywords') initial[field.id] = []
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
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:w-full">
        <div className="border-b border-white/10 px-5 py-4">
          <DialogTitle className="text-base">{template.name}</DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-relaxed">
            {template.description}
          </DialogDescription>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
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
              case 'platform':
                return (
                  <PlatformField
                    key={field.id}
                    value={String(values[field.id] || 'instagram')}
                    onChange={(next) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.id]: next,
                        social_account_id: '',
                        post_id: '',
                      }))
                    }
                    label={field.label}
                  />
                )
              case 'social_account': {
                const platform =
                  (values.platform as 'instagram' | 'facebook' | undefined) ||
                  field.platform ||
                  'instagram'
                return (
                  <SocialAccountField
                    key={`${field.id}-${platform}`}
                    value={String(values[field.id] || '')}
                    onChange={(id) => handleField(field.id, id)}
                    platform={platform}
                    label={field.label}
                    required={field.required}
                  />
                )
              }
              case 'post': {
                const postPlatform =
                  (values.platform as 'instagram' | 'facebook' | undefined) || 'instagram'
                return (
                  <PostField
                    key={`${field.id}-${postPlatform}-${values.social_account_id || ''}`}
                    socialAccountId={String(values.social_account_id || '')}
                    platform={postPlatform}
                    value={String(values[field.id] || '')}
                    onChange={(postId) => handleField(field.id, postId)}
                    label={field.label}
                    required={field.required}
                  />
                )
              }
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

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
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
