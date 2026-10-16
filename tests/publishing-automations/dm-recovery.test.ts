import { describe, expect, it, vi } from 'vitest'
import { normalizeMetaMessagingError, VERIFIED_INSTAGRAM_RESTRICTIONS } from '@/supabase/functions/_shared/meta-messaging-error'
import { DEFAULT_RECOVERY_TEMPLATE, normalizeRecoveryKeyword, renderRecoveryReply, validateDmRecoveryNodeConfigs, validRecoveryTarget } from '@/supabase/functions/_shared/dm-recovery-policy'
import { executeDmRecovery, performCampaignDelivery, validateResourceDelivery } from '@/supabase/functions/_shared/dm-recovery-runtime'

const campaign = '099cbfd8-df8d-430f-bebb-3d8278771a14', verification = 'bf9d3561-f7e5-4882-b2d8-0ceb9f156f85'
const scope = { workspaceId: 'workspace', accountId: 'account', campaignId: campaign, kind: 'fallback', subjectId: 'comment' }
const recoveryConfig = { enabled: true, keyword: 'WinDock', public_template: DEFAULT_RECOVERY_TEMPLATE, verification_automation_id: verification, expires_hours: 72, allow_followup_reply: true }
const node = { id: 'private', data: { type: 'action_private_reply', config: { dm_restriction_recovery: recoveryConfig } } }
const target = { nodes: [
  { id: 'trigger', data: { type: 'trigger_new_message', config: { social_account_id: 'account' } } },
  { id: 'follow', data: { type: 'action_condition', config: { condition_type: 'instagram_follower_status' } } },
  { id: 'deliver', data: { type: 'action_send_dm', config: { resource_campaign_id: campaign, link_url: 'https://windock.vercel.app' } } },
] }

type Row = Record<string, unknown>
function database() {
  let recovery: Row | null = null
  let state = ''
  let failFinish = false
  return {
    failFinish: () => { failFinish = true },
    setRecovery: (row: Row) => { recovery = row },
    state: () => state,
    rpc: vi.fn(async (name: string, args: Row) => {
      if (name === 'claim_instagram_campaign_delivery') {
        if (state) return { data: { claimed: false, status: state }, error: null }
        state = 'sending'
        return { data: { claimed: true, claim_token: 'lease' }, error: null }
      }
      if (failFinish) return { data: null, error: 'database unavailable' }
      state = args.p_status === 'retryable' ? '' : String(args.p_status)
      if (recovery) recovery.fallback_status = state
      return { data: true, error: null }
    }),
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: table === 'automations' ? { id: verification, workflow_graph: target, current_workflow_version_id: 'version' } : recovery, error: null }),
        upsert: async (row: Row) => { recovery ||= { ...row, id: 'recovery', status: 'pending' }; return { error: null } },
      }
      return query
    },
  }
}
function setup() {
  const db = database()
  const send = vi.fn(async () => ({ success: true, output: { replyId: 'reply' } }))
  const sendDm = vi.fn(async () => ({ success: false, output: { meta_error: { outcome: 'recipient_restricted' } } }))
  const params = { db, automation: { id: campaign, workspace_id: 'workspace', workflow_graph: { nodes: [{ id: 'trigger', data: { type: 'trigger_new_comment', config: {} } }, node] } },
    node, context: { comment_id: 'comment', commenter_id: 'recipient', commenter_username: 'alex' }, accountId: 'account', runId: 'run', sendDm,
    sendFallback: (_row: Row, actionScope: typeof scope) => performCampaignDelivery(db, actionScope, send) }
  return { db, send, sendDm, params }
}

describe('Meta restriction classification: fail closed without evidence', () => {
  it('ships with no guessed restriction signatures', () => expect(VERIFIED_INSTAGRAM_RESTRICTIONS).toEqual([]))
  it.each([
    [{ code: 10, error_subcode: 2534022 }, 400, 'unknown'],
    [{ code: 10, error_subcode: 2018108 }, 400, 'unknown'],
    [{ code: 551 }, 400, 'unknown'],
    [{ code: 551, error_subcode: 1545041, type: 'IGApiException', message: "This person isn't available right now." }, 400, 'unknown'],
    [{ code: 100, error_subcode: 2534025, type: 'IGApiException', message: 'The comment is invalid for a private reply' }, 400, 'unknown'],
    [{ code: 100, error_subcode: 2534014, type: 'IGApiException', message: 'Cannot find the requested user.' }, 400, 'unknown'],
    [{ code: 190 }, 400, 'authentication'],
    [{ code: 4 }, 400, 'rate_limited'],
    [{ code: 999 }, 429, 'rate_limited'],
    [{ is_transient: true }, 400, 'temporary'],
    [{ code: 2 }, 500, 'temporary'],
  ])('does not reinterpret broad codes as restrictions', (error, status, outcome) => {
    expect(normalizeMetaMessagingError(error, Number(status)).outcome).toBe(outcome)
  })
  it('requires a complete reviewed signature; fixture numbers are not real Meta codes', () => {
    const signature = { code: -10, subcode: -11, type: 'FixtureOnly', message: 'fixture restriction', evidence: 'test fixture, not production evidence' }
    const payload = { code: -10, error_subcode: -11, type: 'FixtureOnly', message: 'fixture restriction' }
    expect(normalizeMetaMessagingError(payload, 400, [signature]).outcome).toBe('recipient_restricted')
    expect(normalizeMetaMessagingError({ ...payload, error_subcode: -12 }, 400, [signature]).outcome).toBe('unknown')
    expect(normalizeMetaMessagingError(payload, 500, [signature]).outcome).toBe('temporary')
  })
  it('preserves bounded sanitized code, subcode, type, message and trace', () => {
    expect(normalizeMetaMessagingError({ code: 999, error_subcode: 123, type: 'OAuthException', message: 'token=secret-value https://example.com/secret', fbtrace_id: 'trace', access_token: 'secret' }, 400)).toMatchObject({ code: 999, subcode: 123, type: 'OAuthException', message: 'token=[REDACTED] [URL]', trace_id: 'trace' })
  })
})

describe('restriction fallback and delivery reservation', () => {
  it('confirmed restriction produces one public reply across duplicate comment runs', async () => {
    const { params, send, sendDm } = setup()
    const results = await Promise.all(Array.from({ length: 10 }, () => executeDmRecovery(params)))
    expect(send).toHaveBeenCalledTimes(1)
    expect(results.some(r => r.output?.outcome === 'awaiting_recovery_dm')).toBe(true)
    // Private-reply worker has its own comment ledger; wrapper never resends after recovery exists.
    const before = sendDm.mock.calls.length
    await executeDmRecovery(params)
    expect(sendDm).toHaveBeenCalledTimes(before)
  })
  it.each(['rate_limited', 'unknown', 'authentication', 'temporary'])('%s does not trigger a public fallback', async outcome => {
    const { params, send, sendDm } = setup()
    sendDm.mockResolvedValue({ success: false, output: { meta_error: { outcome } } })
    await executeDmRecovery(params)
    expect(send).not.toHaveBeenCalled()
  })
  it('disabled campaigns keep their existing path', async () => {
    const { params, send, sendDm } = setup()
    const disabled = { ...node, data: { ...node.data, config: { dm_restriction_recovery: { ...recoveryConfig, enabled: false } } } }
    await executeDmRecovery({ ...params, node: disabled })
    expect(sendDm).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
  })
  it('requires explicit additional-reply permission when the graph replies publicly', async () => {
    const { params, send } = setup()
    const configured = { ...node, data: { ...node.data, config: { dm_restriction_recovery: { ...recoveryConfig, allow_followup_reply: false } } } }
    const graph = { nodes: [...params.automation.workflow_graph.nodes, { id: 'reply', data: { type: 'action_reply_comment', config: {} } }] }
    const result = await executeDmRecovery({ ...params, node: configured, automation: { ...params.automation, workflow_graph: graph } })
    expect(result.success).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })
  it('does not repeat an accepted send when persistence fails', async () => {
    const db = database(); db.failFinish()
    const send = vi.fn(async () => ({ success: true, output: { replyId: 'accepted' } }))
    await performCampaignDelivery(db, scope, send)
    await performCampaignDelivery(db, scope, send)
    expect(send).toHaveBeenCalledOnce()
    expect(db.state()).toBe('sending')
  })
  it('does not repeat an unknown provider result', async () => {
    const db = database(), send = vi.fn(async () => { throw new Error('timeout') })
    await performCampaignDelivery(db, scope, send)
    await performCampaignDelivery(db, scope, send)
    expect(send).toHaveBeenCalledOnce()
    expect(db.state()).toBe('unknown')
  })
  it('an explicit rate rejection defers through the existing scheduler', async () => {
    const db = database(), send = vi.fn(async () => ({ success: false, output: { meta_error: { outcome: 'rate_limited', http_status: 429 } } }))
    expect(await performCampaignDelivery(db, scope, send)).toMatchObject({ deferred: true, output: { reason: 'meta_rate_limited' } })
    expect(db.state()).toBe('')
  })
  it('public permission rejection is failed and not resent on worker retry', async () => {
    const db = database(), send = vi.fn(async () => ({ success: false, output: { meta_error: { code: 200, http_status: 403 } } }))
    await performCampaignDelivery(db, scope, send)
    await performCampaignDelivery(db, scope, send)
    expect(send).toHaveBeenCalledOnce()
    expect(db.state()).toBe('failed')
  })
  it('already delivered resource does not send twice', async () => {
    const db = database(), send = vi.fn(async () => ({ success: true, output: { messageId: 'dm' } }))
    const resource = { ...scope, kind: 'resource', subjectId: 'recipient' }
    await performCampaignDelivery(db, resource, send)
    expect(await performCampaignDelivery(db, resource, send)).toMatchObject({ success: true, output: { outcome: 'already_delivered_skipped' } })
    expect(send).toHaveBeenCalledOnce()
  })
})

describe('configuration, eligibility and expiration', () => {
  it('normalizes exact keywords and safely interpolates a username', () => {
    expect(normalizeRecoveryKeyword('  WinDock ')).toBe('windock')
    expect(normalizeRecoveryKeyword('WinDock please')).not.toBe('windock')
    expect(renderRecoveryReply('{username}: {keyword}', '@alex\n{keyword}', 'WinDock')).toBe('alexkeyword: WinDock')
  })
  it('requires a same-account target and guarded resource without bypassing the follower check', () => {
    expect(validRecoveryTarget(target, campaign, 'account')).toBe(true)
    expect(validRecoveryTarget(target, campaign, 'other-account')).toBe(false)
    expect(validRecoveryTarget({ nodes: target.nodes.filter(n => n.id !== 'follow') }, campaign, 'account')).toBe(false)
  })
  it('validates template, keyword and expiration', () => {
    const graph = { nodes: [{ data: { type: 'trigger_new_comment' } }, node] }
    expect(validateDmRecoveryNodeConfigs(graph)).toEqual([])
    const bad = { ...node, data: { ...node.data, config: { dm_restriction_recovery: { ...recoveryConfig, keyword: 'two words', expires_hours: 0, public_template: 'missing keyword' } } } }
    expect(validateDmRecoveryNodeConfigs({ nodes: [...graph.nodes, bad] })).toHaveLength(3)
  })
  it('resource delivery still requires the actual successful follower result', async () => {
    const db = database(), automation = { id: verification, workspace_id: 'workspace', workflow_graph: target }
    const resource = target.nodes[2]
    expect(await validateResourceDelivery(db, automation, resource, {}, 'account', { follow: { success: true, output: { conditionResult: false } } })).toContain('follower check')
    expect(await validateResourceDelivery(db, automation, resource, {}, 'account', { follow: { success: true, output: { conditionResult: true } } })).toBeNull()
  })
  it('checks expiration again at delivery after a delayed follower journey', async () => {
    const db = database(); db.setRecovery({ id: 'recovery', status: 'pending', expires_at: '2020-01-01' })
    expect(await validateResourceDelivery(db, { id: verification, workspace_id: 'workspace', workflow_graph: target }, target.nodes[2], { recovery_id: 'recovery', sender_id: 'recipient' }, 'account', { follow: { success: true, output: { conditionResult: true } } })).toContain('expired')
  })
})
