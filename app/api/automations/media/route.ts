import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getActiveWorkspace } from '@/lib/workspace-utils'

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0'

type SupportedPlatform = 'instagram' | 'facebook'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function normalizeFacebookPostMediaType(item: any): 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' {
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

    if (!account.access_token) {
      return NextResponse.json(
        { error: 'No access token available for this account' },
        { status: 400 },
      )
    }

    const platform = account.platform as SupportedPlatform

    if (platform === 'instagram') {
      const mediaUrl =
        `${META_GRAPH_URL}/${account.account_id}/media` +
        `?fields=id,media_type,media_url,thumbnail_url,caption,timestamp,permalink` +
        `&limit=${limit}&access_token=${account.access_token}`

      const response = await fetch(mediaUrl, { cache: 'no-store' })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to fetch Instagram media')
      }

      const media = (result.data || []).map((item: any) => ({
        id: item.id,
        media_type: item.media_type,
        media_url: item.media_url,
        thumbnail_url: item.thumbnail_url || item.media_url || '',
        caption: item.caption || '',
        timestamp: item.timestamp,
        permalink: item.permalink || '',
      }))

      return NextResponse.json({ media, platform })
    }

    const postsUrl =
      `${META_GRAPH_URL}/${account.account_id}/posts` +
      `?fields=id,message,full_picture,created_time,permalink_url,attachments{media_type,media,url,subattachments}` +
      `&limit=${limit}&access_token=${account.access_token}`

    const response = await fetch(postsUrl, { cache: 'no-store' })
    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to fetch Facebook posts')
    }

    const media = (result.data || []).map((item: any) => {
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
  } catch (error: any) {
    console.error('Get automation media API error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch posts/media' },
      { status: 500 },
    )
  }
}
