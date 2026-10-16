"use client"

import useSWR from 'swr'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { DEFAULT_RECOVERY_TEMPLATE, renderRecoveryReply, type DmRecoveryConfig } from '@/supabase/functions/_shared/dm-recovery-policy'

type Campaign = { id: string; name: string; workflow_graph?: { nodes?: Array<{ data?: { type?: string } }> } }
const fetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Could not load campaigns')
  return response.json() as Promise<{ automations: Campaign[] }>
}

export function CampaignSelect({ value, onChange, trigger, label }: { value: string; onChange: (value: string) => void; trigger: string; label: string }) {
  const { data, error } = useSWR('/api/automations', fetcher)
  const campaigns = (data?.automations || []).filter(a => a.workflow_graph?.nodes?.some(n => n.data?.type === trigger))
  return <label className="block space-y-1 text-xs">{label}
    <select className="w-full rounded-md border bg-background p-2" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select campaign</option>
      {value && !campaigns.some(a => a.id === value) && <option value={value}>{value}</option>}
      {campaigns.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
    {error && <span role="alert">Could not load campaigns. Reopen this step to retry.</span>}
  </label>
}

export function DmRecoveryFields({ value, onChange }: { value?: DmRecoveryConfig; onChange: (value: DmRecoveryConfig) => void }) {
  const config: DmRecoveryConfig = value || { enabled: false, keyword: '', public_template: DEFAULT_RECOVERY_TEMPLATE, verification_automation_id: '', expires_hours: 72 }
  const update = (patch: Partial<DmRecoveryConfig>) => onChange({ ...config, ...patch })
  return <fieldset className="space-y-3 rounded-md border p-3">
    <legend className="text-xs font-medium">DM restriction recovery</legend>
    <label className="flex items-center justify-between gap-3 text-xs">Enable public recovery reply
      <Switch checked={config.enabled} onCheckedChange={enabled => update({ enabled })} />
    </label>
    <p className="text-xs text-muted-foreground">Only confirmed recipient messaging restrictions qualify. Unknown errors, expired messaging windows and rate limits never trigger this reply.</p>
    <p className="text-xs text-amber-400">Automatic detection is awaiting a verified Instagram error signature. Enabling this setting alone will not send recovery replies yet.</p>
    {config.enabled && <>
      <CampaignSelect label="Follower verification journey" trigger="trigger_new_message" value={config.verification_automation_id} onChange={verification_automation_id => update({ verification_automation_id })} />
      <p className="text-xs text-muted-foreground">Select this entry campaign on the resource Send DM step in that journey. Its follower check remains required.</p>
      <label className="block space-y-1 text-xs">Recovery keyword
        <Input value={config.keyword} maxLength={64} placeholder="WinDock" onChange={e => update({ keyword: e.target.value })} />
      </label>
      <label className="block space-y-1 text-xs">Public reply template
        <Textarea value={config.public_template} rows={4} onChange={e => update({ public_template: e.target.value })} />
      </label>
      <p className="text-xs text-muted-foreground">Use {'{username}'} and {'{keyword}'}. One line, at most 220 characters after substitution.</p>
      <label className="block space-y-1 text-xs">Valid for (hours, 1–168)
        <Input type="number" min={1} max={168} value={config.expires_hours ?? 72} onChange={e => update({ expires_hours: Number(e.target.value) })} />
      </label>
      <label className="flex items-center justify-between gap-3 text-xs">Allow one additional reply if this campaign already replies publicly
        <Switch checked={config.allow_followup_reply === true} onCheckedChange={allow_followup_reply => update({ allow_followup_reply })} />
      </label>
      <div className="rounded bg-muted p-2 text-xs" aria-label="Recovery reply preview">{renderRecoveryReply(config.public_template, 'alex', config.keyword || 'KEYWORD')}</div>
    </>}
  </fieldset>
}
