// @ts-nocheck - shared Deno graph executor
import { normalizeRecoveryKeyword, renderRecoveryReply, validRecoveryTarget, validateDmRecoveryNodeConfigs } from './dm-recovery-policy.ts'

const deferred = () => ({ success: false, deferred: true, output: { reason: 'meta_rate_limited', retry_after_seconds: 300 } })

/** Claim immediately before invoking the existing action worker. Never release
 * an uncertain claim, including a lost worker response or failed persistence. */
export async function performCampaignDelivery(db, scope, send) {
  const args = { p_workspace_id: scope.workspaceId, p_social_account_id: scope.accountId,
    p_campaign_id: scope.campaignId, p_kind: scope.kind, p_subject_id: scope.subjectId }
  const { data: claim, error } = await db.rpc('claim_instagram_campaign_delivery', args)
  if (error || !claim) return { success: false, error: 'Campaign delivery reservation unavailable' }
  if (!claim.claimed) return claim.status === 'sent'
    ? { success: true, output: { outcome: 'already_delivered_skipped', campaign_id: scope.campaignId } }
    : { success: false, error: 'Campaign delivery is in flight or requires review', output: { outcome: claim.status === 'sending' ? 'delivery_in_flight' : 'delivery_requires_review', delivery_status: claim.status, delivery_unconfirmed: true, automatic_retry: false } }
  let result
  try { result = await send() } catch { result = { success: false } }
  const providerId = result?.output?.messageId || result?.output?.replyId
  const id = typeof providerId === 'string' ? providerId.trim() : ''
  const rateLimited = result?.output?.meta_error?.outcome === 'rate_limited'
  const status = result?.success && id ? 'sent' : rateLimited ? 'retryable'
    : result?.output?.meta_error?.http_status >= 400 && result.output.meta_error.http_status < 500 ? 'failed' : 'unknown'
  const finish = await db.rpc('finish_instagram_campaign_delivery', { ...args,
    p_claim_token: claim.claim_token, p_status: status, p_provider_id: id || null,
    p_meta_error: result?.output?.meta_error || null })
  if (finish.error || finish.data !== true) return { success: false, error: 'Delivery result needs review; reservation retained', output: { delivery_unconfirmed: true, automatic_retry: false } }
  if (rateLimited) return deferred()
  if (status === 'sent') return { ...result, output: { ...result.output, outcome: scope.kind === 'resource' ? (scope.recoveryId ? 'recovery_completed' : 'resource_delivered') : 'fallback_reply_sent' } }
  return { success: false, error: result?.error || 'Delivery result needs review', output: { ...result?.output, delivery_unconfirmed: status === 'unknown', automatic_retry: false } }
}

export async function executeDmRecovery(params) {
  const { db, automation, node, context, accountId, runId, sendDm, sendFallback } = params
  const config = node.data.config.dm_restriction_recovery
  const scope = { workspaceId: automation.workspace_id, accountId, campaignId: automation.id,
    kind: 'fallback', subjectId: context.comment_id }
  if (!config?.enabled || !context.comment_id || !context.commenter_id || !runId) return sendDm()
  const issues = validateDmRecoveryNodeConfigs(automation.workflow_graph)
  if (issues.length) return { success: false, error: issues[0].message }
  const query = () => db.from('instagram_dm_recoveries').select('*').eq('workspace_id', scope.workspaceId)
    .eq('social_account_id', accountId).eq('campaign_id', automation.id).eq('comment_id', context.comment_id).maybeSingle()
  const existing = await query()
  let recovery = existing.data
  const error = existing.error
  if (error) return { success: false, error: 'Recovery storage unavailable' }
  if (!recovery) {
    const result = await sendDm()
    if (result?.output?.meta_error?.outcome !== 'recipient_restricted' || result?.deliveryStatus === 'sent') return result
    const { data: target, error: targetError } = await db.from('automations').select('id,workflow_graph,current_workflow_version_id')
      .eq('id', config.verification_automation_id).eq('workspace_id', scope.workspaceId).eq('social_account_id', accountId).eq('is_active', true).maybeSingle()
    if (targetError || !target?.current_workflow_version_id || !validRecoveryTarget(target.workflow_graph, automation.id, accountId)) {
      return { ...result, error: 'DM restricted; recovery target must be an active, guarded follower verification journey' }
    }
    // Conservative: an entry graph with a public action requires explicit
    // permission for one additional helpful reply, even if its checkpoint is lost.
    const hasPublicReply = automation.workflow_graph.nodes.some(n => n.data.type === 'action_reply_comment')
    const row = { workspace_id: scope.workspaceId, social_account_id: accountId, campaign_id: automation.id,
      comment_id: context.comment_id, recipient_id: context.commenter_id, keyword: normalizeRecoveryKeyword(config.keyword),
      verification_automation_id: target.id, workflow_version_id: target.current_workflow_version_id,
      origin_run_id: runId, node_id: node.id,
      reply_text: renderRecoveryReply(config.public_template, String(context.commenter_username || ''), config.keyword),
      meta_error: result.output.meta_error, fallback_status: hasPublicReply && !config.allow_followup_reply ? 'suppressed' : 'queued',
      expires_at: new Date(Date.now() + (config.expires_hours ?? 72) * 3600000).toISOString() }
    const insert = await db.from('instagram_dm_recoveries').upsert(row, { onConflict: 'workspace_id,social_account_id,campaign_id,comment_id', ignoreDuplicates: true })
    if (insert.error) return { ...result, error: 'DM restricted; recovery could not be saved' }
    const stored = await query()
    if (stored.error || !stored.data) return { success: false, error: 'Recovery state unavailable' }
    recovery = stored.data
  }
  if (recovery.status === 'completed') return { success: true, output: { outcome: 'already_delivered_skipped', recovery_id: recovery.id, stop_branch: true } }
  if (recovery.status === 'expired' || Date.parse(recovery.expires_at) <= Date.now()) return { success: true, output: { outcome: 'recovery_expired', recovery_id: recovery.id, stop_branch: true } }
  if (recovery.fallback_status === 'suppressed') return { success: false, error: 'DM restricted; additional public reply is disabled', output: { outcome: 'dm_restricted', recovery_id: recovery.id } }
  if (recovery.fallback_status === 'sent') return { success: true, output: { outcome: 'awaiting_recovery_dm', recovery_id: recovery.id, stop_branch: true } }
  // Callback passes through the same provider budget guard as normal comments.
  const result = await sendFallback(recovery, scope)
  return result.success ? { success: true, output: { ...result.output, outcome: 'awaiting_recovery_dm', recovery_id: recovery.id, stop_branch: true } } : result
}

export async function validateResourceDelivery(db, automation, node, context, accountId, nodeOutputs) {
  const campaignId = node.data.config.resource_campaign_id
  const issue = validateDmRecoveryNodeConfigs(automation.workflow_graph)[0]
  if (issue) return issue.message
  if (context.recovery_campaign_id && context.recovery_campaign_id !== campaignId) return 'Recovery campaign does not match this resource'
  const followed = automation.workflow_graph.nodes.some(n => n.data.type === 'action_condition'
    && n.data.config.condition_type === 'instagram_follower_status'
    && nodeOutputs?.[n.id]?.success && nodeOutputs[n.id].output?.conditionResult === true)
  if (!followed) return 'Resource delivery requires a successful follower check in this run'
  if (context.recovery_id) {
    const { data, error } = await db.from('instagram_dm_recoveries').select('id,status,expires_at')
      .eq('id', context.recovery_id).eq('workspace_id', automation.workspace_id).eq('social_account_id', accountId)
      .eq('campaign_id', campaignId).eq('verification_automation_id', automation.id).eq('recipient_id', context.sender_id).maybeSingle()
    if (error || !data || data.status !== 'pending' || Date.parse(data.expires_at) <= Date.now()) return 'Recovery is expired, completed or unavailable'
  }
  return null
}
