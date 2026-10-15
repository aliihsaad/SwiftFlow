import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getExplicitActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { canManageCommentsWithMetaAccount, decryptMetaAccountRow } from '@/lib/meta-account'
import { getMetaGraphApiBaseUrl } from '@/lib/meta-graph-version'
import { normalizeMetaGraphError } from '@/lib/meta-graph-errors'
import { assertJsonBodySize, assertMetaGraphNodeId } from '@/lib/security/phase1-validation'
import { enforceRateLimit, RateLimitExceededError } from '@/lib/security/rate-limit'
import { buildInstagramPrivateReplyPlan } from '@/supabase/functions/_shared/instagram-private-reply'
import { deliverPrivateReply, privateReplyWindowOpen } from '@/supabase/functions/_shared/private-reply-delivery'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const workspace = await getExplicitActiveWorkspace()
    if (!workspace) return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
    await requireWorkspacePermission(supabase, user.id, workspace.id, 'content:write')
    assertJsonBodySize(request, 8 * 1024)
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid private message request.' }, { status: 400 })
    }
    // Bind the composer to its original workspace, even if the active cookie
    // changes in another tab while this dialog is open.
    if (body.workspaceId !== workspace.id) {
      return NextResponse.json({ error: 'Your workspace changed. Reopen the comment before sending.' }, { status: 409 })
    }
    const commentId = assertMetaGraphNodeId(body.commentId, 'commentId')
    const postId = assertMetaGraphNodeId(body.postId, 'postId')
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!message || message.length > 1000) {
      return NextResponse.json({ error: 'Write a message between 1 and 1,000 characters.' }, { status: 400 })
    }
    const plan = buildInstagramPrivateReplyPlan({
      custom_button_enabled: body.button != null,
      button_title: body.button?.title,
      button_payload: body.button?.keyword,
    }, message)
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 })

    const { data: row, error: accountError } = await supabase.from('social_accounts').select('*')
      .eq('workspace_id', workspace.id).eq('platform', 'instagram').single()
    const account = row ? decryptMetaAccountRow(row) : null
    if (accountError || !account?.access_token) {
      return NextResponse.json({ error: 'Connect Instagram in Settings before sending a private message.' }, { status: 400 })
    }
    if (!canManageCommentsWithMetaAccount(account.metadata, 'instagram')) {
      return NextResponse.json({ error: 'Reconnect Instagram with comment management permission.', errorCode: 'meta_missing_permission' }, { status: 403 })
    }
    await enforceRateLimit({ scope: 'comment-private-reply', subject: `${workspace.id}:${account.id}:${user.id}`, limit: 20, windowSeconds: 60 },
      'Please wait a moment before sending another private message.')

    const accountId = assertMetaGraphNodeId(account.account_id, 'accountId')
    const baseUrl = getMetaGraphApiBaseUrl(account.metadata.connection_method)
    const headers = { Authorization: `Bearer ${account.access_token}` }
    const proof = process.env.INSTAGRAM_APP_SECRET
      ? createHmac('sha256', process.env.INSTAGRAM_APP_SECRET).update(account.access_token).digest('hex') : undefined
    const readNode = async (id: string, fields: string) => {
      const params = new URLSearchParams({ fields })
      if (proof) params.set('appsecret_proof', proof)
      const response = await fetch(`${baseUrl}/${id}?${params}`, {
        headers, cache: 'no-store', signal: AbortSignal.timeout(10_000), redirect: 'error',
      })
      const data = await response.json()
      if (!response.ok || data?.error) {
        const error = normalizeMetaGraphError(data?.error, { feature: 'comments' })
        throw new PrivateReplyReadError(error.message, error.httpStatus)
      }
      return data
    }
    // Never trust the browser's timestamp or assume a readable media object is
    // owned by this workspace's account. Verify both edges before reserving.
    const comment = await readNode(commentId, 'id,media,timestamp')
    const commentMediaId = typeof comment.media === 'string' ? comment.media : comment.media?.id
    if (comment.id !== commentId || commentMediaId !== postId) {
      return NextResponse.json({ error: 'This comment does not belong to the selected post.' }, { status: 403 })
    }
    const media = await readNode(postId, 'id,owner')
    const ownerId = typeof media.owner === 'string' ? media.owner : media.owner?.id
    let ownsMedia = ownerId === accountId
    if (!ownsMedia && media.id === postId && ownerId) {
      // Instagram Login exposes both app-scoped `id` and `user_id`; media.owner
      // can use the former while our connection stores the latter. Only accept
      // that alias after verifying both IDs from this token's own profile.
      const identity = await readNode('me', 'id,user_id')
      const identityIds = [identity.id, identity.user_id].filter((id): id is string => typeof id === 'string')
      ownsMedia = identityIds.includes(accountId) && identityIds.includes(ownerId)
    }
    if (media.id !== postId || !ownsMedia) {
      return NextResponse.json({ error: 'This post does not belong to the connected Instagram account.' }, { status: 403 })
    }
    if (!privateReplyWindowOpen(comment.timestamp || '')) {
      return NextResponse.json({ error: 'Private messages must be sent within seven days of the comment.', errorCode: 'private_reply_expired' }, { status: 409 })
    }
    const result = await deliverPrivateReply(createAdminClient(), {
      workspaceId: workspace.id, socialAccountId: account.id, commentId, source: 'manual',
    }, plan, (providerMessage) => fetch(`${baseUrl}/${accountId}/messages`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: providerMessage, ...(proof ? { appsecret_proof: proof } : {}) }),
      signal: AbortSignal.timeout(15_000), redirect: 'error',
    }))
    return NextResponse.json(result, { status: result.success ? 200
      : result.errorCode === 'private_reply_unavailable' ? 503
      : result.errorCode === 'private_reply_rejected' ? 422 : 409 })
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } })
    }
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) return NextResponse.json({ error: 'You do not have permission to send private messages in this workspace.' }, { status: permissionStatus })
    if (error instanceof PrivateReplyReadError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof SyntaxError || (error instanceof Error && /Invalid (commentId|postId|accountId)|Request payload too large|Invalid content length/.test(error.message))) {
      return NextResponse.json({ error: 'Invalid private message request.' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Could not verify this comment. Please try again.' }, { status: 503 })
  }
}

class PrivateReplyReadError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
