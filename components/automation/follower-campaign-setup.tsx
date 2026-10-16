"use client"

import { useState } from 'react'
import useSWR from 'swr'
import { ArrowLeft, Loader2, MessageCircle, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { PostSelector } from './post-selector'
import type { InstagramMedia } from '@/types/automation'
import type { FollowerCampaignInput } from '@/lib/automation-templates/follower-campaign'

async function fetchAccounts(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Could not load Instagram accounts')
  return response.json()
}

export function FollowerCampaignSetup({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast()
  const { data: accounts } = useSWR<{ accounts: { id: string; account_name: string }[] }>('/api/automations/instagram-accounts', fetchAccounts)
  const [post, setPost] = useState<InstagramMedia | null>(null)
  const [step, setStep] = useState<'post' | 'messages'>('post')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [form, setForm] = useState<FollowerCampaignInput>({
    name: '', accountId: '', postId: '', keyword: '', allComments: false, profileUsername: '',
    publicReply: 'Check your DMs 📩',
    privateMessage: 'Thanks for your interest! Follow the account, then tap I Followed to get the link.',
    deliveryMessage: 'Thanks for following! Here is the resource you requested.',
    resourceUrl: '', buttonText: 'Get the link', useAiReply: false,
  })
  const update = <K extends keyof FollowerCampaignInput>(key: K, value: FollowerCampaignInput[K]) =>
    setForm(current => ({ ...current, [key]: value }))

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/automations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follower_campaign: form }),
      })
      const body = await response.json()
      if (!response.ok) {
        setError(body.error || 'Could not create the campaign. Please try again.')
        return
      }
      toast({ title: 'Both automations are ready', description: 'Your comment flow and follower check were saved paused. Review them, then enable both.' })
      onCreated()
    } catch {
      // An interrupted response may follow a successful atomic insert. Do not
      // encourage another POST that could create duplicate campaign drafts.
      setUncertain(true)
      setError('The save response was interrupted. Close this window and check the automation list before creating another campaign.')
    } finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col overflow-hidden border-white/10 bg-[#151620] p-0 text-white">
        <DialogHeader className="shrink-0 border-b border-white/10 p-5 pr-12">
          <DialogTitle>Comment → DM → Follower check</DialogTitle>
          <DialogDescription>Set up both connected automations for your next post in one place.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto p-5">
          {step === 'post' ? (
            <div className="space-y-5">
              <PostSelector selectedPost={post} selectedAccountId={form.accountId} onSelect={(selected, accountId) => {
                setPost(selected)
                setForm(current => ({ ...current, accountId, postId: selected.id,
                  profileUsername: accounts?.accounts.find(account => account.id === accountId)?.account_name.replace(/^@/, '') || current.profileUsername,
                }))
              }} />
              <Button className="w-full" disabled={!post || !form.accountId} onClick={() => setStep('messages')}>Continue to messages</Button>
            </div>
          ) : (
            <form onSubmit={save} className="space-y-5">
              <Button type="button" variant="ghost" size="sm" disabled={saving || uncertain} onClick={() => setStep('post')}><ArrowLeft className="mr-2 h-4 w-4" />Change post</Button>
              <fieldset disabled={saving || uncertain} className="space-y-4 disabled:opacity-60">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="campaign-name">Campaign name</Label><Input id="campaign-name" required maxLength={100} placeholder="My next reel" value={form.name} onChange={e => update('name', e.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="campaign-profile">Instagram username to follow</Label><Input id="campaign-profile" required maxLength={31} placeholder="youraccount" value={form.profileUsername} onChange={e => update('profileUsername', e.target.value)} /></div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campaign-keyword">Comment keyword</Label>
                  <Input id="campaign-keyword" required={!form.allComments} disabled={form.allComments} maxLength={80} placeholder="GUIDE" value={form.keyword} onChange={e => update('keyword', e.target.value)} />
                  <label className="flex items-center gap-2 text-sm text-white/60"><input type="checkbox" checked={form.allComments} onChange={e => update('allComments', e.target.checked)} />Respond to all comments on this post</label>
                </div>
                <div className="space-y-2"><Label htmlFor="campaign-reply">Public comment reply</Label><Textarea id="campaign-reply" required maxLength={1000} value={form.publicReply} onChange={e => update('publicReply', e.target.value)} />
                  <label className="flex items-center gap-2 text-sm text-white/60"><input type="checkbox" checked={form.useAiReply} onChange={e => update('useAiReply', e.target.checked)} />Vary this reply with AI</label>
                  <p className="text-xs text-white/45">Saved text sends faster and uses no AI credits.</p>
                </div>
                <div className="space-y-2"><Label htmlFor="campaign-private">Private message</Label><Textarea id="campaign-private" required maxLength={1000} value={form.privateMessage} onChange={e => update('privateMessage', e.target.value)} /><p className="text-xs text-white/45">Includes “Follow account” and “I Followed” buttons.</p></div>
                <div className="space-y-2"><Label htmlFor="campaign-delivery">Message after following</Label><Textarea id="campaign-delivery" required maxLength={1000} value={form.deliveryMessage} onChange={e => update('deliveryMessage', e.target.value)} /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="campaign-url">Resource link</Label><Input id="campaign-url" required type="url" maxLength={2048} placeholder="https://example.com/resource" value={form.resourceUrl} onChange={e => update('resourceUrl', e.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="campaign-button">Link button text</Label><Input id="campaign-button" required maxLength={20} value={form.buttonText} onChange={e => update('buttonText', e.target.value)} /></div>
                </div>
              </fieldset>
              <div className="space-y-2 rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-4 text-sm text-white/75">
                <p className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-cyan-200" />Comment reply + private follow prompt</p>
                <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-200" />Follower check + resource delivery</p>
                <p className="pt-1 text-xs text-white/50">Both are saved paused for review. Enable both when you’re ready. Each campaign has its own connected “I Followed” button.</p>
              </div>
              {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
              <Button type="submit" className="w-full" disabled={saving || uncertain}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? 'Creating both drafts…' : 'Create both drafts'}</Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
