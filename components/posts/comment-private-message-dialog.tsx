"use client"

import { useRef, useState } from 'react'
import { ArrowRight, Loader2, LockKeyhole, Send } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useWorkspacePermission } from '@/components/workspace/workspace-role-provider'

export type CommentPrivateReplyStatus = 'sending' | 'sent' | 'failed' | 'unknown' | 'unavailable' | null

interface Props {
  comment: { platform_comment_id: string; author_username: string; message: string }
  postId: string
  workspaceId: string
  onClose: () => void
  onDeliveryChange: (status: CommentPrivateReplyStatus) => void
}

export function CommentPrivateMessageDialog({ comment, postId, workspaceId, onClose, onDeliveryChange }: Props) {
  const [message, setMessage] = useState('')
  const [withButton, setWithButton] = useState(false)
  const [buttonTitle, setButtonTitle] = useState('')
  const [keyword, setKeyword] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [locked, setLocked] = useState(false)
  const inFlight = useRef(false)
  const canWrite = useWorkspacePermission('content:write')
  const maxMessageLength = withButton ? 640 : 1000
  const valid = !!message.trim() && message.trim().length <= maxMessageLength
    && (!withButton || (!!buttonTitle.trim() && !!keyword.trim()))

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault()
    if (!valid || !canWrite || locked || inFlight.current) return
    inFlight.current = true
    setSending(true)
    setError('')
    try {
      const response = await fetch('/api/posts-media/comments/private-reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId, postId, commentId: comment.platform_comment_id, message: message.trim(),
          button: withButton ? { title: buttonTitle.trim(), keyword: keyword.trim() } : undefined,
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        if (result.deliveryStatus) onDeliveryChange(result.deliveryStatus)
        if (['private_reply_unknown', 'private_reply_already_sent', 'private_reply_expired'].includes(result.errorCode)) setLocked(true)
        setError(result.error || 'The private message could not be sent.')
        return
      }
      onDeliveryChange('sent')
      onClose()
    } catch {
      setLocked(true)
      onDeliveryChange('unknown')
      setError('The connection was interrupted. Check Instagram before sending again; your message may have been delivered.')
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !inFlight.current) onClose() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-white/10 bg-[#151620] text-white sm:max-w-lg" showCloseButton={!sending}>
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300"><LockKeyhole className="h-5 w-5" /></div>
          <DialogTitle>Private message</DialogTitle>
          <DialogDescription className="text-white/50">Send a message to @{comment.author_username} about their comment.</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
          <p className="text-xs font-medium text-white/60">@{comment.author_username} commented</p>
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-white/80">{comment.message}</p>
        </div>
        <form onSubmit={sendMessage} className="space-y-4">
          <fieldset disabled={sending || locked || !canWrite} className="space-y-4 disabled:opacity-60">
            <div className="space-y-2">
              <Label htmlFor="private-message-text">Message</Label>
              <Textarea id="private-message-text" value={message} onChange={(event) => setMessage(event.target.value)}
                placeholder="Thanks for commenting! Here’s what you asked for…" rows={4} maxLength={1000}
                className="resize-y border-white/10 bg-white/[0.03] placeholder:text-white/25" autoFocus required />
              <p className={`text-right text-xs ${message.trim().length > maxMessageLength ? 'text-rose-300' : 'text-white/40'}`}>
                {message.trim().length}/{maxMessageLength}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="private-message-button">Add a button</Label>
                  <p className="mt-1 text-xs text-white/45">Let their click start a follow-up automation.</p>
                </div>
                <Switch id="private-message-button" checked={withButton} onCheckedChange={setWithButton} />
              </div>
              {withButton && <div className="space-y-3 border-t border-white/10 pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="private-message-button-title">Button text</Label>
                  <Input id="private-message-button-title" value={buttonTitle} onChange={(event) => setButtonTitle(event.target.value)}
                    placeholder="Get my guide" maxLength={20} required className="border-white/10 bg-white/[0.03]" />
                  <p className="text-xs text-white/40">What the recipient sees. Up to 20 characters.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="private-message-keyword">Automation keyword</Label>
                  <Input id="private-message-keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)}
                    placeholder="SEND_GUIDE" maxLength={128} required className="border-white/10 bg-white/[0.03]" aria-describedby="private-message-keyword-help" />
                  <p id="private-message-keyword-help" className="text-xs leading-relaxed text-white/45">
                    Use the matching keyword from an active New Message automation for this Instagram account. Clicking the button sends this keyword to your automation.
                  </p>
                </div>
              </div>}
            </div>
          </fieldset>
          {message.trim() && <div className="space-y-2" aria-label="Message preview">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Preview</p>
            <div className="overflow-hidden rounded-xl border border-sky-400/15 bg-sky-400/[0.06]">
              <p className="whitespace-pre-wrap break-words p-3.5 text-sm text-white/85">{message.trim()}</p>
              {withButton && <div className="flex items-center justify-center gap-2 border-t border-sky-400/15 p-2.5 text-sm font-medium text-sky-300">
                {buttonTitle.trim() || 'Your button'}<ArrowRight className="h-3.5 w-3.5" />
              </div>}
            </div>
          </div>}
          <p className="text-xs leading-relaxed text-white/45">Instagram allows one private message per comment, within seven days. It may arrive in Message Requests.</p>
          {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={sending} className="text-white/60">{locked ? 'Close' : 'Cancel'}</Button>
            <Button type="submit" disabled={!valid || sending || locked || !canWrite} className="bg-sky-400 text-slate-950 hover:bg-sky-300">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Sending…' : 'Send private message'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
