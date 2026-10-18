import { buildGraphFromBlueprint } from './utils'
import { FOLLOWER_CHECK_COOLDOWN_SECONDS } from '@/supabase/functions/_shared/message-trigger-policy'

export interface FollowerCampaignInput {
  name: string
  accountId: string
  postId: string
  keyword: string
  allComments: boolean
  profileUsername: string
  publicReply: string
  privateMessage: string
  deliveryMessage: string
  resourceUrl: string
  buttonText: string
  useAiReply: boolean
}

function field(input: Record<string, unknown>, key: string, maximum = 1000): string {
  const value = typeof input[key] === 'string' ? input[key].trim() : ''
  if (!value || value.length > maximum) throw new Error(`Invalid campaign ${key}`)
  return value
}

export function buildFollowerCampaign(raw: unknown, confirmationId: string) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid campaign settings')
  const input = raw as Record<string, unknown>
  const name = field(input, 'name', 100)
  const accountId = field(input, 'accountId', 36)
  const postId = field(input, 'postId', 128)
  if (!/^[0-9a-f-]{36}$/i.test(accountId) || !/^[0-9_]{3,128}$/.test(postId)) throw new Error('Invalid campaign account or post')
  const keyword = input.allComments === true ? '' : field(input, 'keyword', 80)
  const username = field(input, 'profileUsername', 31).replace(/^@/, '')
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(username)) throw new Error('Invalid campaign Instagram username')
  const publicReply = field(input, 'publicReply')
  const privateMessage = field(input, 'privateMessage')
  const deliveryMessage = field(input, 'deliveryMessage')
  const buttonText = field(input, 'buttonText', 20)
  const resourceUrl = field(input, 'resourceUrl', 2048)
  let url: URL
  try { url = new URL(resourceUrl) } catch { throw new Error('Invalid campaign resource URL') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid campaign resource URL')
  if (!/^[0-9a-f-]{36}$/i.test(confirmationId)) throw new Error('Invalid campaign confirmation ID')
  const payload = `SF_CONFIRM_${confirmationId.replaceAll('-', '')}`
  const profileUrl = `https://www.instagram.com/${username}/`
  const useAi = input.useAiReply === true
  const entryGraph = buildGraphFromBlueprint([
    { key: 'comment', type: 'trigger_new_comment', label: 'New Comment', position: { x: 80, y: 100 }, config: {
      platform: 'instagram', social_account_id: accountId, post_scope: 'specific', post_id: postId,
      trigger_type: keyword ? 'keywords' : 'any', keywords: keyword ? [keyword] : [],
    } },
    ...(useAi ? [{ key: 'ai', type: 'action_ai_response' as const, label: 'Vary Comment Reply', position: { x: 350, y: 100 }, config: {
      use_global_settings: true, max_tokens: 150, tone: 'friendly', length: 'short', include_cta: false,
      custom_instructions: `Write a short variation of this comment reply. Preserve its meaning: ${publicReply}`,
    } }] : []),
    { key: 'reply', type: 'action_reply_comment', label: 'Reply to Comment', position: { x: useAi ? 620 : 350, y: 100 }, config: {
      use_ai_response: useAi, messages: [publicReply],
    } },
    { key: 'private', type: 'action_private_reply', label: 'Follow + I Followed', position: { x: useAi ? 890 : 620, y: 100 }, config: {
      use_ai_response: false, message: privateMessage, follower_gate_enabled: true,
      follow_button_text: 'Follow account', follow_profile_url: profileUrl,
      confirm_button_text: 'I Followed', confirm_payload: payload, button_fallback_to_text: true,
    } },
  ], [
    ...(useAi ? [{ source: 'comment', target: 'ai' }, { source: 'ai', target: 'reply' }] : [{ source: 'comment', target: 'reply' }]),
    { source: 'reply', target: 'private' },
  ])
  const verificationGraph = buildGraphFromBlueprint([
    { key: 'confirm', type: 'trigger_new_message', label: 'I Followed', position: { x: 80, y: 150 }, config: {
      platform: 'instagram', social_account_id: accountId, trigger_type: 'keywords', keywords: [payload],
      recipient_cooldown_seconds: FOLLOWER_CHECK_COOLDOWN_SECONDS,
    } },
    { key: 'wait', type: 'action_delay', label: 'Wait for Instagram', position: { x: 350, y: 150 }, config: { duration_value: 5, duration_unit: 'seconds' } },
    { key: 'check', type: 'action_condition', label: 'Check Follower', position: { x: 620, y: 150 }, config: { condition_type: 'instagram_follower_status', operator: 'equals' } },
    { key: 'deliver', type: 'action_send_dm', label: 'Send Resource', position: { x: 920, y: 40 }, config: {
      use_ai_response: false, opening_message: deliveryMessage, cta_mode: 'button', button_text: buttonText,
      link_url: url.toString(), cta_button_fallback_to_text: true, fallback_to_private_reply_on_failure: false,
      resource_campaign_id: confirmationId,
    } },
    { key: 'retry', type: 'action_send_dm', label: 'Ask to Follow', position: { x: 920, y: 260 }, config: {
      use_ai_response: false, opening_message: 'I couldn’t confirm the follow yet. Follow the account below, wait one minute, then tap I Followed in the first message again.',
      cta_mode: 'button', button_text: 'Follow account', link_url: profileUrl,
      cta_button_fallback_to_text: true, fallback_to_private_reply_on_failure: false,
    } },
  ], [
    { source: 'confirm', target: 'wait' }, { source: 'wait', target: 'check' },
    { source: 'check', target: 'deliver', sourceHandle: 'true', label: 'Following' },
    { source: 'check', target: 'retry', sourceHandle: 'false', label: 'Not following' },
  ])
  return {
    entry: { id: confirmationId, name: `${name} · Comments`, social_account_id: accountId, editor_version: 'canvas', is_active: false, workflow_graph: entryGraph },
    verification: { name: `${name} · Follower check`, workflow_graph: verificationGraph },
  }
}
