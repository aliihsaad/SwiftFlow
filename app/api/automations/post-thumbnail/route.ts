import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { canReadConnectedMediaWithMetaAccount, decryptMetaAccountRow } from '@/lib/meta-account'
import { getMetaGraphApiBaseUrl } from '@/lib/meta-graph-version'
import { isMetaGraphNodeId, isUuid } from '@/lib/security/phase1-validation'
import { getInstagramThumbnailUrl } from '@/lib/instagram-thumbnail'

export const dynamic = 'force-dynamic'

function unavailable(status: number) {
  return NextResponse.json({ error: 'Post preview is unavailable' }, {
    status, headers: { 'Cache-Control': 'private, no-store' },
  })
}

// Refresh display metadata only. Never rewrite the graph or create a workflow
// version just because an Instagram CDN signature has expired.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return unavailable(401)
    const workspace = await getActiveWorkspace()
    if (!workspace) return unavailable(404)
    await requireWorkspacePermission(supabase, user.id, workspace.id, 'workspace:read')

    const accountId = request.nextUrl.searchParams.get('account_id')
    const postId = request.nextUrl.searchParams.get('post_id')
    if (!isUuid(accountId) || !isMetaGraphNodeId(postId)) return unavailable(400)

    // Only refresh a post already selected by this workspace's automation.
    const { data: automation, error: automationError } = await supabase.from('automations')
      .select('id').eq('workspace_id', workspace.id).eq('social_account_id', accountId)
      .eq('platform_post_id', postId).limit(1).maybeSingle()
    if (automationError || !automation) return unavailable(404)

    const { data: account, error: accountError } = await supabase.from('social_accounts')
      .select('access_token,metadata').eq('id', accountId).eq('workspace_id', workspace.id)
      .eq('platform', 'instagram').single()
    if (accountError || !account) return unavailable(404)
    const connected = decryptMetaAccountRow(account)
    if (!connected.access_token || !canReadConnectedMediaWithMetaAccount(connected.metadata, 'instagram')) {
      return unavailable(403)
    }

    const params = new URLSearchParams({ fields: 'id,media_type,media_url,thumbnail_url' })
    const response = await fetch(`${getMetaGraphApiBaseUrl()}/${postId}?${params}`, {
      headers: { Authorization: `Bearer ${connected.access_token}` },
      cache: 'no-store', signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return unavailable(502)
    const thumbnailUrl = getInstagramThumbnailUrl(await response.json())
    if (!thumbnailUrl) return unavailable(404)
    return NextResponse.json({ thumbnail_url: thumbnailUrl }, {
      headers: { 'Cache-Control': 'private, max-age=300', Vary: 'Cookie' },
    })
  } catch (error) {
    return unavailable(getWorkspacePermissionErrorStatus(error) || 502)
  }
}
