/** Shared by the editor, API validation, and Deno executor. Opt-in only. */
export const DEFAULT_RECOVERY_TEMPLATE = "Hey {username}! 👋 Instagram isn't letting me DM you first 😅 Just send me {keyword} in a DM (only that word), and I'll send you the link right away! 📩"

export interface DmRecoveryConfig {
  enabled: boolean
  keyword: string
  public_template: string
  verification_automation_id: string
  expires_hours?: number
  allow_followup_reply?: boolean
}

export const normalizeRecoveryKeyword = (value: string) => value.trim().toLowerCase()
export const validRecoveryKeyword = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)

export function renderRecoveryReply(template: string, username: string, keyword: string): string {
  const safeUsername = username.replace(/^@/, '').replace(/[^A-Za-z0-9_.]/g, '').slice(0, 30) || 'there'
  return template.replace(/\{username\}/g, () => safeUsername).replace(/\{keyword\}/g, () => keyword)
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type Graph = { nodes?: Array<{ id?: string; data?: { type?: string; config?: unknown } }> }
export function validateDmRecoveryNodeConfigs(graph: Graph | null | undefined) {
  const issues: Array<{ nodeId: string; message: string }> = []
  for (const node of graph?.nodes || []) {
    const config = (node.data?.config || {}) as Record<string, unknown>
    const recovery = config.dm_restriction_recovery as DmRecoveryConfig | undefined
    const fail = (message: string) => issues.push({ nodeId: node.id || '', message })
    if (recovery?.enabled) {
      if (config.resource_campaign_id) fail('Use recovery on the entry message and the delivery guard on the separate resource step.')
      if (!['action_private_reply', 'action_send_dm'].includes(node.data?.type || '')) fail('DM recovery belongs on a messaging action.')
      if (!graph?.nodes?.some(n => n.data?.type === 'trigger_new_comment')) fail('DM recovery requires an originating comment trigger.')
      if (!validRecoveryKeyword(recovery.keyword)) fail('Recovery keyword must be one word: 1–64 letters, numbers, underscores or hyphens.')
      if (!uuid.test(recovery.verification_automation_id || '')) fail('Choose the follower verification automation for recovery.')
      const template = recovery.public_template
      if (typeof template !== 'string' || !template.includes('{keyword}') || /[\r\n]/.test(template)
        || /\{(?!username\}|keyword\})[^}]*\}/.test(template)
        || renderRecoveryReply(template, 'x'.repeat(30), recovery.keyword || '').length > 220) {
        fail('Recovery reply must contain {keyword}, use only {username}/{keyword}, and fit 220 characters including the username and keyword.')
      }
      if (recovery.expires_hours != null && (!Number.isInteger(recovery.expires_hours) || recovery.expires_hours < 1 || recovery.expires_hours > 168)) fail('Recovery validity must be 1–168 hours; the default is 72 hours.')
    }
    if (config.resource_campaign_id) {
      if (node.data?.type !== 'action_send_dm' || !uuid.test(String(config.resource_campaign_id))) fail('Resource delivery must reference a valid entry campaign automation ID.')
      if (!config.link_url || config.use_ai_cta || config.use_ai_response) fail('Guarded resource delivery requires a configured link and static message; AI resource destinations are not supported.')
      if (!graph?.nodes?.some(n => n.data?.type === 'action_condition' && (n.data.config as Record<string, unknown>)?.condition_type === 'instagram_follower_status')) fail('Guarded resource delivery requires a follower verification condition.')
    }
  }
  return issues
}

/** Never infer a target from a keyword. Require an explicit same-account journey. */
export function validRecoveryTarget(graph: Graph, campaignId: string, accountId: string): boolean {
  const nodes = graph?.nodes || []
  const triggers = nodes.filter(n => n.data?.type?.startsWith('trigger_'))
  const config = (node: typeof nodes[number]) => (node.data?.config || {}) as Record<string, unknown>
  const profileLink = (value: unknown) => typeof value === 'string' && /^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?$/.test(value)
  return triggers.length === 1 && triggers[0].data?.type === 'trigger_new_message'
    && config(triggers[0]).social_account_id === accountId
    && nodes.some(n => n.data?.type === 'action_condition' && config(n).condition_type === 'instagram_follower_status')
    && nodes.some(n => n.data?.type === 'action_send_dm' && config(n).resource_campaign_id === campaignId && config(n).link_url)
    && nodes.every(n => ['trigger_new_message', 'action_delay', 'action_condition', 'action_send_dm'].includes(n.data?.type || '')
      && (n.data?.type !== 'action_send_dm' || (!config(n).use_ai_cta && !config(n).use_ai_response
        && (!config(n).link_url || profileLink(config(n).link_url) || config(n).resource_campaign_id === campaignId))))
}
