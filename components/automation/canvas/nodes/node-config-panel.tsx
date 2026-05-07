"use client"

import { useEffect } from 'react'
import useSWR from 'swr'
import { X, Check, Image as ImageIcon, Video, LayoutGrid, Instagram, Facebook } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { InstagramMedia } from '@/types/automation'
import type {
  WorkflowNode,
  WorkflowNodeData,
  TriggerNewCommentConfig,
  TriggerNewMessageConfig,
  TriggerCronConfig,
  TriggerStoryMentionConfig,
  TriggerStoryReplyConfig,
  ActionSendDMConfig,
  ActionPrivateReplyConfig,
  ActionReplyCommentConfig,
  ActionDelayConfig,
  ActionConditionConfig,
  ActionHttpRequestConfig,
  ActionAiResponseConfig,
  ActionSendEmailConfig,
} from '@/types/automation-graph'

interface NodeConfigPanelProps {
  node: WorkflowNode
  onUpdate: (nodeId: string, data: Partial<WorkflowNodeData>) => void
  onClose: () => void
  onDelete: (nodeId: string) => void
  mobile?: boolean
}

export function NodeConfigPanel({ node, onUpdate, onClose, onDelete, mobile = false }: NodeConfigPanelProps) {
  const data = node.data as WorkflowNodeData
  const config = data.config as unknown as Record<string, unknown>

  function updateConfig(updates: Record<string, unknown>) {
    onUpdate(node.id, {
      ...data,
      config: { ...config, ...updates } as unknown as WorkflowNodeData['config'],
    })
  }

  function updateLabel(label: string) {
    onUpdate(node.id, { ...data, label })
  }

  return (
    <div
      className={cn(
        'overflow-y-auto',
        mobile
          ? 'absolute inset-x-0 bottom-0 z-30 max-h-[72vh] rounded-t-xl shadow-2xl'
          : 'h-full w-80',
      )}
      style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', background: '#151620' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 className="font-semibold text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>Configure Node</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7" style={{ color: 'rgba(255,255,255,0.65)' }}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {/* Node Label */}
        <div>
          <Label className="text-xs">Node Name</Label>
          <Input
            value={data.label}
            onChange={(e) => updateLabel(e.target.value)}
            className="mt-1"
          />
        </div>

        {/* Type-specific config */}
        {renderConfigFields(data.type, config, updateConfig)}

        {/* Delete */}
        <div className="pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            style={{ background: '#ef4444', color: '#fff' }}
            onClick={() => onDelete(node.id)}
          >
            Delete Node
          </Button>
        </div>
      </div>
    </div>
  )
}

function renderConfigFields(
  type: string,
  config: Record<string, unknown>,
  updateConfig: (updates: Record<string, unknown>) => void,
) {
  switch (type) {
    case 'trigger_new_comment':
      return <TriggerCommentFields config={config as unknown as TriggerNewCommentConfig} onUpdate={updateConfig} />
    case 'trigger_new_message':
      return <TriggerMessageFields config={config as unknown as TriggerNewMessageConfig} onUpdate={updateConfig} />
    case 'trigger_story_mention':
      return <TriggerStoryMentionFields config={config as unknown as TriggerStoryMentionConfig} onUpdate={updateConfig} />
    case 'trigger_story_reply':
      return <TriggerStoryMentionFields config={config as unknown as TriggerStoryReplyConfig} onUpdate={updateConfig} />
    case 'trigger_cron':
      return <TriggerCronFields config={config as unknown as TriggerCronConfig} onUpdate={updateConfig} />
    case 'action_send_dm':
      return <ActionDMFields config={config as unknown as ActionSendDMConfig} onUpdate={updateConfig} />
    case 'action_private_reply':
      return <ActionPrivateReplyFields config={config as unknown as ActionPrivateReplyConfig} onUpdate={updateConfig} />
    case 'action_reply_comment':
      return <ActionReplyFields config={config as unknown as ActionReplyCommentConfig} onUpdate={updateConfig} />
    case 'action_delay':
      return <ActionDelayFields config={config as unknown as ActionDelayConfig} onUpdate={updateConfig} />
    case 'action_condition':
      return <ActionConditionFields config={config as unknown as ActionConditionConfig} onUpdate={updateConfig} />
    case 'action_send_email':
      return <ActionEmailFields config={config as unknown as ActionSendEmailConfig} onUpdate={updateConfig} />
    case 'action_http_request':
      return <ActionHttpFields config={config as unknown as ActionHttpRequestConfig} onUpdate={updateConfig} />
    case 'action_ai_response':
      return <ActionAiFields config={config as unknown as ActionAiResponseConfig} onUpdate={updateConfig} />
    default:
      return <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>No configuration available.</p>
  }
}

// ─── Config Field Components ───────────────────────────────────

const configFetcher = async (url: string) => {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to fetch')
  return data
}

interface SocialAccount {
  id: string
  platform: string
  account_name: string
  account_id: string
}

type TriggerPlatform = 'instagram' | 'facebook'

function getTriggerPlatformValue(value: unknown): TriggerPlatform {
  return value === 'facebook' ? 'facebook' : 'instagram'
}

function PlatformAccountIcon({ platform }: { platform: TriggerPlatform }) {
  return platform === 'facebook'
    ? <Facebook className="h-3.5 w-3.5 text-blue-500" />
    : <Instagram className="h-3.5 w-3.5 text-pink-500" />
}

function TriggerCommentFields({ config, onUpdate }: { config: TriggerNewCommentConfig; onUpdate: (u: Record<string, unknown>) => void }) {
  const platform = getTriggerPlatformValue(config.platform)
  const accountId = config.social_account_id || ''

  // Fetch platform accounts
  const { data: accountsData, isLoading: accountsLoading } = useSWR<{ accounts: SocialAccount[] }>(
    `/api/automations/social-accounts?platform=${platform}`,
    configFetcher,
  )

  // Fetch posts/media for selected account (IG media or FB posts)
  const { data: postsData, isLoading: postsLoading } = useSWR<{ media: InstagramMedia[] }>(
    accountId ? `/api/automations/media?account_id=${accountId}` : null,
    configFetcher,
  )

  const platformAccounts = (accountsData?.accounts || []).filter(
    (a) => a.platform === platform,
  )

  // Auto-select first account
  useEffect(() => {
    if (!accountId && platformAccounts.length > 0) {
      const first = platformAccounts[0]
      onUpdate({ social_account_id: first.id, platform })
    }
  }, [platformAccounts, accountId, onUpdate, platform])

  const handlePlatformChange = (newPlatformValue: string) => {
    const nextPlatform = getTriggerPlatformValue(newPlatformValue)
    onUpdate({
      platform: nextPlatform,
      social_account_id: '',
      post_id: '',
      post_thumbnail_url: undefined,
      post_caption: undefined,
    })
  }

  const handleAccountChange = (newId: string) => {
    onUpdate({
      platform,
      social_account_id: newId,
      post_id: '',
      post_thumbnail_url: undefined,
      post_caption: undefined,
    })
  }

  const handlePostSelect = (post: InstagramMedia) => {
    onUpdate({
      post_id: post.id,
      post_thumbnail_url: post.thumbnail_url || post.media_url || '',
      post_caption: post.caption || '',
    })
  }

  const getMediaIcon = (mediaType: string) => {
    switch (mediaType) {
      case 'VIDEO': return Video
      case 'CAROUSEL_ALBUM': return LayoutGrid
      default: return ImageIcon
    }
  }

  return (
    <>
      <div>
        <Label className="text-xs">Platform</Label>
        <Select value={platform} onValueChange={handlePlatformChange}>
          <SelectTrigger className="mt-1 w-full">
            <SelectValue placeholder="Select platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="instagram">
              <div className="flex items-center gap-2">
                <Instagram className="h-3.5 w-3.5 text-pink-500" />
                <span className="text-sm">Instagram</span>
              </div>
            </SelectItem>
            <SelectItem value="facebook">
              <div className="flex items-center gap-2">
                <Facebook className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-sm">Facebook</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Account selector */}
      <div>
        <Label className="text-xs">{platform === 'instagram' ? 'Instagram Account' : 'Facebook Page'}</Label>
        {accountsLoading ? (
          <Skeleton className="h-9 w-full mt-1" />
        ) : platformAccounts.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-1">
            {platform === 'instagram' ? 'No Instagram accounts connected.' : 'No Facebook pages connected.'}
          </p>
        ) : (
          <Select value={accountId} onValueChange={handleAccountChange}>
            <SelectTrigger className="mt-1 w-full">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {platformAccounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  <div className="flex items-center gap-2">
                    <PlatformAccountIcon platform={platform} />
                    <span className="text-sm">{acc.account_name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Post grid */}
      <div>
        <Label className="text-xs">Select {platform === 'instagram' ? 'Post' : 'Page Post'}</Label>
        {postsLoading ? (
          <div className="grid grid-cols-3 gap-1.5 mt-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-md" />
            ))}
          </div>
        ) : !postsData?.media || postsData.media.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-1">
            {accountId ? `No ${platform === 'instagram' ? 'posts' : 'page posts'} found.` : 'Select an account first.'}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 mt-1 max-h-[280px] overflow-y-auto">
            {postsData.media.map((post) => {
              const isSelected = config.post_id === post.id
              const MediaIcon = getMediaIcon(post.media_type)

              return (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => handlePostSelect(post)}
                  className={cn(
                    "relative aspect-square rounded-md overflow-hidden group transition-all",
                    "ring-2 ring-transparent hover:ring-primary/50",
                    isSelected && "ring-primary ring-offset-1"
                  )}
                >
                  {post.thumbnail_url || post.media_url ? (
                    <img
                      src={post.thumbnail_url || post.media_url!}
                      alt={post.caption || 'Post'}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}

                  {post.media_type !== 'IMAGE' && (
                    <div className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 rounded">
                      <MediaIcon className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}

                  {isSelected && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <div className="bg-primary text-primary-foreground rounded-full p-0.5">
                        <Check className="h-3 w-3" />
                      </div>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected post preview */}
      {config.post_id && config.post_caption && (
        <div className="rounded-md border border-border/50 bg-muted/30 p-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Selected Post</p>
          <div className="flex items-start gap-2">
            {config.post_thumbnail_url && (
              <img
                src={config.post_thumbnail_url}
                alt="Selected"
                className="w-10 h-10 rounded object-cover shrink-0"
              />
            )}
            <p className="text-xs text-muted-foreground line-clamp-2">{config.post_caption}</p>
          </div>
        </div>
      )}

      {/* Trigger type */}
      <div>
        <Label className="text-xs">Trigger Type</Label>
        <select
          value={config.trigger_type}
          onChange={(e) => onUpdate({ trigger_type: e.target.value })}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="any">Any Comment</option>
          <option value="keywords">Keywords</option>
        </select>
      </div>

      {config.trigger_type === 'keywords' && (
        <div>
          <Label className="text-xs">Keywords (comma separated)</Label>
          <Input
            value={(config.keywords || []).join(', ')}
            onChange={(e) => onUpdate({ keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) })}
            placeholder="link, guide, yes"
            className="mt-1"
          />
        </div>
      )}
    </>
  )
}

function TriggerMessageFields({ config, onUpdate }: { config: TriggerNewMessageConfig; onUpdate: (u: Record<string, unknown>) => void }) {
  const platform = getTriggerPlatformValue(config.platform)
  const { data: accountsData, isLoading: accountsLoading } = useSWR<{ accounts: SocialAccount[] }>(
    `/api/automations/social-accounts?platform=${platform}`,
    configFetcher,
  )

  const platformAccounts = (accountsData?.accounts || []).filter((a) => a.platform === platform)

  useEffect(() => {
    if (!config.social_account_id && platformAccounts.length > 0) {
      onUpdate({ social_account_id: platformAccounts[0].id, platform })
    }
  }, [config.social_account_id, onUpdate, platform, platformAccounts])

  return (
    <>
      <div>
        <Label className="text-xs">Platform</Label>
        <Select
          value={platform}
          onValueChange={(newPlatformValue) => {
            const nextPlatform = getTriggerPlatformValue(newPlatformValue)
            onUpdate({ platform: nextPlatform, social_account_id: '' })
          }}
        >
          <SelectTrigger className="mt-1 w-full">
            <SelectValue placeholder="Select platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="instagram">
              <div className="flex items-center gap-2">
                <Instagram className="h-3.5 w-3.5 text-pink-500" />
                <span className="text-sm">Instagram</span>
              </div>
            </SelectItem>
            <SelectItem value="facebook">
              <div className="flex items-center gap-2">
                <Facebook className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-sm">Facebook</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs">{platform === 'instagram' ? 'Instagram Account' : 'Facebook Page'}</Label>
        {accountsLoading ? (
          <Skeleton className="h-9 w-full mt-1" />
        ) : platformAccounts.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-1">
            {platform === 'instagram' ? 'No Instagram accounts connected.' : 'No Facebook pages connected.'}
          </p>
        ) : (
          <Select
            value={config.social_account_id || ''}
            onValueChange={(newId) => {
              onUpdate({ social_account_id: newId, platform })
            }}
          >
            <SelectTrigger className="mt-1 w-full">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {platformAccounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  <div className="flex items-center gap-2">
                    <PlatformAccountIcon platform={platform} />
                    <span className="text-sm">{acc.account_name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div>
        <Label className="text-xs">Trigger Type</Label>
        <select
          value={config.trigger_type}
          onChange={(e) => onUpdate({ trigger_type: e.target.value })}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="any">Any Message</option>
          <option value="keywords">Keywords</option>
        </select>
      </div>
      {config.trigger_type === 'keywords' && (
        <div>
          <Label className="text-xs">Keywords (comma separated)</Label>
          <Input
            value={(config.keywords || []).join(', ')}
            onChange={(e) => onUpdate({ keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) })}
            className="mt-1"
          />
        </div>
      )}
    </>
  )
}

function TriggerCronFields({ config, onUpdate }: { config: TriggerCronConfig; onUpdate: (u: Record<string, unknown>) => void }) {
  return (
    <>
      <div>
        <Label className="text-xs">Cron Expression</Label>
        <Input
          value={config.schedule || ''}
          onChange={(e) => onUpdate({ schedule: e.target.value })}
          placeholder="0 9 * * *"
          className="mt-1"
        />
        <p className="text-[10px] text-muted-foreground mt-1">e.g., &quot;0 9 * * *&quot; = daily at 9am</p>
      </div>
      <div>
        <Label className="text-xs">Timezone</Label>
        <Input
          value={config.timezone || 'UTC'}
          onChange={(e) => onUpdate({ timezone: e.target.value })}
          className="mt-1"
        />
      </div>
    </>
  )
}

function ActionDMFields({ config, onUpdate }: { config: ActionSendDMConfig; onUpdate: (u: Record<string, unknown>) => void }) {
  const fallbackEnabled = config.fallback_to_private_reply_on_failure === true
  const useAiResponse = config.use_ai_response === true
  const useAiCta = config.use_ai_cta === true
  const ctaMode = config.cta_mode || 'button'
  const ctaButtonFallbackToText = config.cta_button_fallback_to_text !== false

  return (
    <>
      <div className="rounded-md border border-border/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs">Use AI Response as DM Message</Label>
            <p className="text-[10px] text-muted-foreground mt-1">
              Sends output from the latest AI Response node automatically.
            </p>
          </div>
          <Switch
            checked={useAiResponse}
            onCheckedChange={(checked) => onUpdate({ use_ai_response: checked })}
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">
          {useAiResponse ? 'Fallback Message (optional)' : 'Opening Message'}
        </Label>
        <Textarea
          value={config.opening_message || ''}
          onChange={(e) => onUpdate({ opening_message: e.target.value })}
          placeholder={
            useAiResponse
              ? "Used only if AI response is empty or unavailable."
              : "Hey! Thanks for your comment..."
          }
          className="mt-1"
          rows={3}
        />
        {useAiResponse && (
          <p className="text-[10px] text-muted-foreground mt-1">
            No variables needed. The node uses AI output directly.
          </p>
        )}
      </div>

      {useAiResponse && (
        <div className="rounded-md border border-border/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-xs">Use CTA from AI Response node</Label>
              <p className="text-[10px] text-muted-foreground mt-1">
                Pull CTA link/button settings from AI node (when configured).
              </p>
            </div>
            <Switch
              checked={useAiCta}
              onCheckedChange={(checked) => onUpdate({ use_ai_cta: checked })}
            />
          </div>
        </div>
      )}

      <div>
        <Label className="text-xs">CTA Delivery</Label>
        <select
          value={ctaMode}
          onChange={(e) => onUpdate({ cta_mode: e.target.value })}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="button">Button</option>
          <option value="text">Text Link</option>
        </select>
      </div>

      {ctaMode === 'button' && (
        <div className="rounded-md border border-border/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-xs">Fallback to Text Link if Button Fails</Label>
              <p className="text-[10px] text-muted-foreground mt-1">
                Improves reliability when template buttons are rejected.
              </p>
            </div>
            <Switch
              checked={ctaButtonFallbackToText}
              onCheckedChange={(checked) => onUpdate({ cta_button_fallback_to_text: checked })}
            />
          </div>
        </div>
      )}

      <div>
        <Label className="text-xs">{useAiCta ? 'Fallback CTA Link URL' : 'CTA Link URL'}</Label>
        <Input
          value={config.link_url || ''}
          onChange={(e) => onUpdate({ link_url: e.target.value })}
          placeholder="https://..."
          className="mt-1"
        />
      </div>
      {ctaMode === 'button' && (
        <div>
          <Label className="text-xs">{useAiCta ? 'Fallback CTA Button Text' : 'CTA Button Text'}</Label>
          <Input
            value={config.button_text || ''}
            onChange={(e) => onUpdate({ button_text: e.target.value })}
            placeholder="Get the link"
            className="mt-1"
          />
        </div>
      )}
      <div>
        <Label className="text-xs">{useAiCta ? 'Fallback CTA Message (optional)' : 'CTA Message (optional)'}</Label>
        <Input
          value={config.link_message || ''}
          onChange={(e) => onUpdate({ link_message: e.target.value })}
          placeholder="Tap below to continue"
          className="mt-1"
        />
      </div>

      <div className="rounded-md border border-border/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs">Fallback to Private Reply on Failure</Label>
            <p className="text-[10px] text-muted-foreground mt-1">
              Only falls back for DM delivery-window/recipient errors.
            </p>
          </div>
          <Switch
            checked={fallbackEnabled}
            onCheckedChange={(checked) =>
              onUpdate({ fallback_to_private_reply_on_failure: checked })
            }
          />
        </div>

        {fallbackEnabled && (
          <div className="mt-3">
            <Label className="text-xs">Fallback Private Reply Message (optional)</Label>
            <Textarea
              value={config.fallback_message || ''}
              onChange={(e) => onUpdate({ fallback_message: e.target.value })}
              placeholder="If empty, opening message + link will be used."
              className="mt-1"
              rows={3}
            />
          </div>
        )}
      </div>
    </>
  )
}

function TriggerStoryMentionFields({ config, onUpdate }: { config: TriggerStoryMentionConfig; onUpdate: (u: Record<string, unknown>) => void }) {
  const { data: accountsData, isLoading: accountsLoading } = useSWR<{ accounts: SocialAccount[] }>(
    '/api/automations/instagram-accounts',
    configFetcher,
  )

  const instagramAccounts = accountsData?.accounts?.filter(a => a.platform === 'instagram') || []

  return (
    <div>
      <Label className="text-xs">Instagram Account</Label>
      {accountsLoading ? (
        <Skeleton className="h-9 w-full mt-1" />
      ) : instagramAccounts.length === 0 ? (
        <p className="text-xs text-muted-foreground mt-1">No Instagram accounts connected.</p>
      ) : (
        <Select
          value={config.social_account_id || ''}
          onValueChange={(newId) => {
            onUpdate({ social_account_id: newId })
          }}
        >
          <SelectTrigger className="mt-1 w-full">
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {instagramAccounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                <div className="flex items-center gap-2">
                  <Instagram className="h-3.5 w-3.5 text-pink-500" />
                  <span className="text-sm">{acc.account_name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

function ActionPrivateReplyFields({ config, onUpdate }: { config: ActionPrivateReplyConfig; onUpdate: (u: Record<string, unknown>) => void }) {
  const useAiResponse = config.use_ai_response === true
  return (
    <>
      <div className="rounded-md border border-border/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs">Use AI Response as Private Reply</Label>
            <p className="text-[10px] text-muted-foreground mt-1">
              Sends the latest AI output automatically.
            </p>
          </div>
          <Switch
            checked={useAiResponse}
            onCheckedChange={(checked) => onUpdate({ use_ai_response: checked })}
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">
          {useAiResponse ? 'Fallback Private Reply Message (optional)' : 'Private Reply Message'}
        </Label>
        <Textarea
          value={config.message || ''}
          onChange={(e) => onUpdate({ message: e.target.value })}
          placeholder={useAiResponse ? 'Used only if AI output is empty.' : 'Thanks! Check your inbox.'}
          className="mt-1"
          rows={3}
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          This action requires comment context and will fail on non-comment triggers.
        </p>
      </div>
    </>
  )
}

function ActionReplyFields({ config, onUpdate }: { config: ActionReplyCommentConfig; onUpdate: (u: Record<string, unknown>) => void }) {
  const useAiResponse = config.use_ai_response === true
  const messages = config.messages || ['']
  return (
    <>
      <div className="rounded-md border border-border/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs">Use AI Response as Comment Reply</Label>
            <p className="text-[10px] text-muted-foreground mt-1">
              Sends the latest AI output automatically.
            </p>
          </div>
          <Switch
            checked={useAiResponse}
            onCheckedChange={(checked) => onUpdate({ use_ai_response: checked })}
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">
          {useAiResponse ? 'Fallback Reply Messages (random pick, optional)' : 'Reply Messages (random pick)'}
        </Label>
        {messages.map((msg, i) => (
          <div key={i} className="flex gap-1 mt-1">
            <Input
              value={msg}
              onChange={(e) => {
                const updated = [...messages]
                updated[i] = e.target.value
                onUpdate({ messages: updated })
              }}
              placeholder={useAiResponse ? `Fallback ${i + 1}` : `Reply ${i + 1}`}
            />
            {messages.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => onUpdate({ messages: messages.filter((_, j) => j !== i) })}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          onClick={() => onUpdate({ messages: [...messages, ''] })}
        >
          + Add Reply
        </Button>
      </div>
    </>
  )
}

function ActionDelayFields({ config, onUpdate }: { config: ActionDelayConfig; onUpdate: (u: Record<string, unknown>) => void }) {
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <Label className="text-xs">Duration</Label>
        <Input
          type="number"
          min={1}
          value={config.duration_value || 5}
          onChange={(e) => onUpdate({ duration_value: parseInt(e.target.value) || 1 })}
          className="mt-1"
        />
      </div>
      <div className="flex-1">
        <Label className="text-xs">Unit</Label>
        <select
          value={config.duration_unit || 'minutes'}
          onChange={(e) => onUpdate({ duration_unit: e.target.value })}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="seconds">Seconds</option>
          <option value="minutes">Minutes</option>
          <option value="hours">Hours</option>
          <option value="days">Days</option>
        </select>
      </div>
    </div>
  )
}

function ActionConditionFields({ config, onUpdate }: { config: ActionConditionConfig; onUpdate: (u: Record<string, unknown>) => void }) {
  return (
    <>
      <div>
        <Label className="text-xs">Condition Type</Label>
        <select
          value={config.condition_type || 'keyword_match'}
          onChange={(e) => onUpdate({ condition_type: e.target.value })}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="keyword_match">Keyword Match</option>
          <option value="follower_count">Follower Count</option>
          <option value="comment_count">Comment Count</option>
        </select>
      </div>
      <div>
        <Label className="text-xs">Operator</Label>
        <select
          value={config.operator || 'contains'}
          onChange={(e) => onUpdate({ operator: e.target.value })}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="contains">Contains</option>
          <option value="not_contains">Does Not Contain</option>
          <option value="equals">Equals</option>
          <option value="greater_than">Greater Than</option>
          <option value="less_than">Less Than</option>
        </select>
      </div>
      {config.condition_type === 'keyword_match' && (
        <div>
          <Label className="text-xs">Keywords (comma separated)</Label>
          <Input
            value={(config.keywords || []).join(', ')}
            onChange={(e) => onUpdate({ keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) })}
            className="mt-1"
          />
        </div>
      )}
      {(config.condition_type === 'follower_count' || config.condition_type === 'comment_count') && (
        <div>
          <Label className="text-xs">Threshold</Label>
          <Input
            type="number"
            value={config.threshold || 0}
            onChange={(e) => onUpdate({ threshold: parseInt(e.target.value) || 0 })}
            className="mt-1"
          />
        </div>
      )}
    </>
  )
}

function ActionEmailFields({ config, onUpdate }: { config: ActionSendEmailConfig; onUpdate: (u: Record<string, unknown>) => void }) {
  useEffect(() => {
    // Migrate legacy node configs that used a non-sendable "commenter" recipient option.
    if (config.recipient_type !== 'custom') {
      onUpdate({ recipient_type: 'custom' })
    }
  }, [config.recipient_type, onUpdate])

  return (
    <>
      <div className="rounded-md border border-border/60 bg-muted/30 p-3">
        <Label className="text-xs">Recipient Type</Label>
        <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
          This node sends to a custom email address only. Use it for internal alerts, error notifications, and other custom emails.
        </p>
      </div>
      <div>
        <Label className="text-xs">Email Address</Label>
        <Input
          type="email"
          value={config.recipient_email || ''}
          onChange={(e) => onUpdate({ recipient_email: e.target.value, recipient_type: 'custom' })}
          placeholder="alerts@company.com"
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-xs">Subject</Label>
        <Input
          value={config.subject || ''}
          onChange={(e) => onUpdate({ subject: e.target.value })}
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-xs">Body</Label>
        <Textarea
          value={config.body || ''}
          onChange={(e) => onUpdate({ body: e.target.value })}
          className="mt-1"
          rows={4}
        />
      </div>
    </>
  )
}

function ActionHttpFields({ config, onUpdate }: { config: ActionHttpRequestConfig; onUpdate: (u: Record<string, unknown>) => void }) {
  return (
    <>
      <div>
        <Label className="text-xs">Method</Label>
        <select
          value={config.method || 'GET'}
          onChange={(e) => onUpdate({ method: e.target.value })}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>
      <div>
        <Label className="text-xs">URL</Label>
        <Input
          value={config.url || ''}
          onChange={(e) => onUpdate({ url: e.target.value })}
          placeholder="https://api.example.com/..."
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-xs">Request Body (JSON)</Label>
        <Textarea
          value={config.body || ''}
          onChange={(e) => onUpdate({ body: e.target.value })}
          className="mt-1 font-mono text-xs"
          rows={4}
        />
      </div>
    </>
  )
}

const GEMINI_MODELS = [
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
]

const AI_GOALS = [
  { value: 'auto', label: 'Auto by Trigger' },
  { value: 'reply_comment', label: 'Reply to Comment' },
  { value: 'send_dm', label: 'Send DM' },
  { value: 'welcome_new_follower', label: 'Welcome Follower' },
  { value: 'support_answer', label: 'Support Answer' },
]

const AI_TONES = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'playful', label: 'Playful' },
  { value: 'empathetic', label: 'Empathetic' },
  { value: 'sales', label: 'Sales' },
]

const AI_LENGTHS = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
]

const AI_EMOJI_LEVELS = [
  { value: 'none', label: 'None' },
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

function ActionAiFields({ config, onUpdate }: { config: ActionAiResponseConfig; onUpdate: (u: Record<string, unknown>) => void }) {
  const useGlobal = config.use_global_settings !== false // default true
  const includeCta = config.include_cta === true
  const ctaMode = config.cta_mode || 'button'

  return (
    <>
      {/* Preset behavior controls */}
      <div>
        <Label className="text-xs">Reply Goal</Label>
        <select
          value={config.preset_goal || 'auto'}
          onChange={(e) => onUpdate({ preset_goal: e.target.value })}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {AI_GOALS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Tone</Label>
          <select
            value={config.tone || 'friendly'}
            onChange={(e) => onUpdate({ tone: e.target.value })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {AI_TONES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Length</Label>
          <select
            value={config.length || 'short'}
            onChange={(e) => onUpdate({ length: e.target.value })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {AI_LENGTHS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Language</Label>
          <select
            value={config.language || 'same_as_user'}
            onChange={(e) => onUpdate({ language: e.target.value })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="same_as_user">Match User</option>
            <option value="English">English</option>
            <option value="Arabic">Arabic</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Emoji Level</Label>
          <select
            value={config.emoji_level || 'light'}
            onChange={(e) => onUpdate({ emoji_level: e.target.value })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {AI_EMOJI_LEVELS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-md border border-border/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs">Include CTA</Label>
            <p className="text-[10px] text-muted-foreground mt-1">
              Configure optional CTA details for downstream DM buttons/text.
            </p>
          </div>
          <Switch
            checked={includeCta}
            onCheckedChange={(checked) => onUpdate({ include_cta: checked })}
          />
        </div>

        {includeCta && (
          <div className="mt-3 space-y-2">
            <div>
              <Label className="text-xs">CTA Delivery</Label>
              <select
                value={ctaMode}
                onChange={(e) => onUpdate({ cta_mode: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="button">Button</option>
                <option value="text">Text Link</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">CTA Link URL</Label>
              <Input
                value={config.cta_link_url || ''}
                onChange={(e) => onUpdate({ cta_link_url: e.target.value })}
                placeholder="https://..."
                className="mt-1"
              />
            </div>
            {ctaMode === 'button' && (
              <div>
                <Label className="text-xs">CTA Button Text</Label>
                <Input
                  value={config.cta_button_text || ''}
                  onChange={(e) => onUpdate({ cta_button_text: e.target.value })}
                  placeholder="Open Link"
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <Label className="text-xs">CTA Context Message (optional)</Label>
              <Input
                value={config.cta_link_message || ''}
                onChange={(e) => onUpdate({ cta_link_message: e.target.value })}
                placeholder="Tap below to continue"
                className="mt-1"
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <Label className="text-xs">Extra Instructions (optional)</Label>
        <Textarea
          value={config.custom_instructions || ''}
          onChange={(e) => onUpdate({ custom_instructions: e.target.value })}
          placeholder="Example: mention our free trial."
          className="mt-1"
          rows={2}
        />
      </div>

      {/* Global vs custom model */}
      <div>
        <Label className="text-xs">Model Settings</Label>
        <select
          value={useGlobal ? 'global' : 'custom'}
          onChange={(e) => onUpdate({ use_global_settings: e.target.value === 'global' })}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="global">Use workspace default</option>
          <option value="custom">Override model</option>
        </select>
        <p className="text-[10px] text-muted-foreground mt-1">
          {useGlobal
            ? 'Uses the model & API key configured in Settings > AI Provider.'
            : 'Select a specific model for this node.'}
        </p>
      </div>

      {/* Model dropdown (only when custom) */}
      {!useGlobal && (
        <div>
          <Label className="text-xs">Model</Label>
          <select
            value={config.model || 'gemini-1.5-flash'}
            onChange={(e) => onUpdate({ model: e.target.value })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {GEMINI_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Optional prompt override */}
      <div>
        <Label className="text-xs">Prompt Template (optional override)</Label>
        <Textarea
          value={config.prompt_template || ''}
          onChange={(e) => onUpdate({ prompt_template: e.target.value })}
          placeholder="Leave empty to use the preset options above."
          className="mt-1"
          rows={5}
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Variables: {'{{comment_text}}'}, {'{{username}}'}, {'{{message_text}}'}
        </p>
      </div>

      {/* Max tokens */}
      <div>
        <Label className="text-xs">Max Tokens</Label>
        <Input
          type="number"
          value={config.max_tokens || 500}
          onChange={(e) => onUpdate({ max_tokens: parseInt(e.target.value) || 500 })}
          className="mt-1"
        />
      </div>

      {/* Info box */}
      <div className="rounded-md bg-muted/50 border border-border/50 p-2.5">
        <p className="text-[10px] font-medium text-foreground mb-1">How it works</p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Generates one response using your presets + workspace AI provider. Downstream nodes (Send DM, Reply Comment)
          can use <code className="bg-muted px-1 rounded">{'{{ai_response}}'}</code> in their
          message templates to include the generated text.
        </p>
      </div>
    </>
  )
}
