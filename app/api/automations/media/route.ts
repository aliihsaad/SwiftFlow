import { NextRequest, NextResponse } from 'next/server'
import { canReadConnectedMediaWithMetaAccount, decryptMetaAccountRow } from '@/lib/meta-account'
import { getMetaGraphApiBaseUrl } from '@/lib/meta-graph-version'
import { createClient } from '@/utils/supabase/server'
import { getActiveWorkspace } from '@/lib/workspace-utils'


type SupportedPlatform = 'instagram' | 'facebook'

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

interface FacebookAttachment {
  media_type?: string
  media?: {
    image?: { src?: string }
    source?: string
  }
  url?: string
  subattachments?: { data?: FacebookAttachment[] }
}

interface FacebookPostItem {
  id: string
  message?: string
  full_picture?: string
  created_time: string
  permalink_url?: string
  attachments?: { data?: FacebookAttachment[] }
}

interface MetaGraphListResponse<T> {
  data?: T[]
  error?: MetaGraphError
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

function normalizeFacebookPostMediaType(item: FacebookPostItem): 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' {
  const firstAttachment = item?.attachments?.data?.[0]
  const mediaType = String(firstAttachment?.media_type || '').toLowerCase()

  if (mediaType.includes('video')) return 'VIDEO'
  if (firstAttachment?.subattachments?.data?.length) return 'CAROUSEL_ALBUM'
  return 'IMAGE'
}

// GET - Fetch selectable post/media items for automation triggers (Instagram or Facebook)
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

    const { searchParams } = new URL(request.url)
    const socialAccountRowId = searchParams.get('account_id')
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10) || 25, 50)

    if (!socialAccountRowId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
    }

    const { data: account, error: accountError } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('id', socialAccountRowId)
      .eq('workspace_id', activeWorkspace.id)
      .in('platform', ['instagram', 'facebook'])
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }
    const decryptedAccount = decryptMetaAccountRow(account)
    const graphBaseUrl = getMetaGraphApiBaseUrl(
      decryptedAccount.metadata?.connection_method,
    )

    if (!decryptedAccount.access_token) {
      return NextResponse.json(
        { error: 'No access token available for this account' },
        { status: 400 },
      )
    }

    if (!canReadConnectedMediaWithMetaAccount(
      decryptedAccount.metadata,
      decryptedAccount.platform === 'facebook' ? 'facebook' : 'instagram',
    )) {
      return NextResponse.json(
        {
          error: 'Media access is not available for this connected account',
          errorCode: 'meta_missing_permission',
          missingPermissions: decryptedAccount.platform === 'facebook'
            ? ['pages_manage_posts']
            : ['instagram_basic'],
          requiresReconnect: false,
        },
        { status: 403 },
      )
    }

    const platform = account.platform as SupportedPlatform

    if (platform === 'instagram') {
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

      return NextResponse.json({ media, platform })
    }

    const postsUrl =
      `${graphBaseUrl}/${decryptedAccount.account_id}/posts` +
      `?fields=id,message,full_picture,created_time,permalink_url,attachments{media_type,media,url,subattachments}` +
      `&limit=${limit}&access_token=${decryptedAccount.access_token}`

    const response = await fetch(postsUrl, { cache: 'no-store' })
    const result = await response.json() as MetaGraphListResponse<FacebookPostItem>

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to fetch Facebook posts')
    }

    const media = (result.data || []).map((item) => {
      const firstAttachment = item?.attachments?.data?.[0]
      const imageFromAttachment =
        firstAttachment?.media?.image?.src ||
        firstAttachment?.media?.source ||
        firstAttachment?.url ||
        firstAttachment?.subattachments?.data?.[0]?.media?.image?.src ||
        ''

      const previewImage = item.full_picture || imageFromAttachment || ''

      return {
        id: item.id,
        media_type: normalizeFacebookPostMediaType(item),
        media_url: previewImage,
        thumbnail_url: previewImage,
        caption: item.message || '',
        timestamp: item.created_time,
        permalink: item.permalink_url || '',
      }
    })

    return NextResponse.json({ media, platform })
  } catch (error: unknown) {
    console.error('Get automation media API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch posts/media'
    return NextResponse.json(
      { error: message },
      { status: 500 },
    )
  }
}
