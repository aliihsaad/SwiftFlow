import { NextRequest, NextResponse } from 'next/server'
import { canReadConnectedMediaWithMetaAccount, decryptMetaAccountRow } from '@/lib/meta-account'
import { getMetaGraphApiBaseUrl } from '@/lib/meta-graph-version'
import { createClient } from '@/utils/supabase/server'
import { getActiveWorkspace } from '@/lib/workspace-utils'

interface MetaGraphError {
  message?: string
}

interface InstagramMediaItem {
  id: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  media_product_type?: string
  media_url?: string
  thumbnail_url?: string
  caption?: string
  timestamp: string
  permalink?: string
}

interface MetaGraphListResponse<T> {
  data?: T[]
  error?: MetaGraphError
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET - Fetch selectable Instagram media for automation triggers.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
    }

    const socialAccountRowId = request.nextUrl.searchParams.get('account_id')
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '25', 10) || 25, 50)

    if (!socialAccountRowId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
    }

    const { data: account, error: accountError } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('id', socialAccountRowId)
      .eq('workspace_id', activeWorkspace.id)
      .eq('platform', 'instagram')
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: 'Instagram account not found' }, { status: 404 })
    }

    const decryptedAccount = decryptMetaAccountRow(account)
    const graphBaseUrl = getMetaGraphApiBaseUrl(decryptedAccount.metadata?.connection_method)

    if (!decryptedAccount.access_token) {
      return NextResponse.json(
        { error: 'No access token available for this account' },
        { status: 400 },
      )
    }

    if (!canReadConnectedMediaWithMetaAccount(decryptedAccount.metadata, 'instagram')) {
      return NextResponse.json(
        {
          error: 'Media access is not available for this connected Instagram account',
          errorCode: 'meta_missing_permission',
          missingPermissions: ['instagram_basic'],
          requiresReconnect: false,
        },
        { status: 403 },
      )
    }

    const mediaUrl =
      `${graphBaseUrl}/${decryptedAccount.account_id}/media` +
      `?fields=id,media_type,media_product_type,media_url,thumbnail_url,caption,timestamp,permalink` +
      `&limit=${limit}&access_token=${decryptedAccount.access_token}`

    const response = await fetch(mediaUrl, { cache: 'no-store' })
    const result = await response.json() as MetaGraphListResponse<InstagramMediaItem>

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to fetch Instagram media')
    }

    const media = (result.data || []).map((item) => ({
      id: item.id,
      media_type: item.media_type,
      media_product_type: item.media_product_type,
      media_url: item.media_url,
      thumbnail_url: item.thumbnail_url || item.media_url || '',
      caption: item.caption || '',
      timestamp: item.timestamp,
      permalink: item.permalink || '',
    }))

    return NextResponse.json({ media, platform: 'instagram' })
  } catch (error: unknown) {
    console.error('Get automation media API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch Instagram media'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
