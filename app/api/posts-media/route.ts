import { NextRequest, NextResponse } from 'next/server';
import { canReadConnectedMediaWithMetaAccount, decryptMetaAccountRow } from '@/lib/meta-account';
import { META_GRAPH_API_BASE_URL } from '@/lib/meta-graph-version';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

const META_GRAPH_URL = META_GRAPH_API_BASE_URL;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET - Fetch media posts from Instagram or Facebook using account_id + token
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Auth check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get active workspace
        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }

        const { searchParams } = new URL(request.url);
        const platform = searchParams.get('platform') || 'instagram';
        const limit = parseInt(searchParams.get('limit') || '25');
        const after = searchParams.get('after') || ''; // pagination cursor

        // Get the social account for this platform in this workspace
        const { data: account, error: accountError } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', platform)
            .single();

        if (accountError || !account) {
            return NextResponse.json(
                { error: `No ${platform} account connected`, media: [] },
                { status: 200 }
            );
        }
        const decryptedAccount = decryptMetaAccountRow(account);

        if (!decryptedAccount.access_token) {
            return NextResponse.json(
                { error: 'No access token available for this account' },
                { status: 400 }
            );
        }

        if (!canReadConnectedMediaWithMetaAccount(
            decryptedAccount.metadata,
            platform === 'facebook' ? 'facebook' : 'instagram',
        )) {
            return NextResponse.json(
                {
                    error: 'Media access is not available for this connected account',
                    errorCode: 'meta_missing_permission',
                    missingPermissions: platform === 'facebook'
                        ? ['pages_manage_posts']
                        : ['instagram_basic'],
                    requiresReconnect: false,
                    media: [],
                },
                { status: 403 }
            );
        }

        let media: any[] = [];
        let paging: any = null;

        if (platform === 'instagram') {
            // Instagram: GET /{ig-user-id}/media
            let mediaUrl = `${META_GRAPH_URL}/${decryptedAccount.account_id}/media?fields=id,media_type,media_url,thumbnail_url,caption,timestamp,permalink,comments_count,like_count&limit=${limit}&access_token=${decryptedAccount.access_token}`;
            if (after) {
                mediaUrl += `&after=${after}`;
            }

            console.log(`[PostsMedia] Fetching Instagram media for account ${decryptedAccount.account_id}`);
            const response = await fetch(mediaUrl, { cache: 'no-store' });
            const result = await response.json();

            if (!response.ok) {
                console.error('[PostsMedia] Instagram API error:', result.error);
                throw new Error(result.error?.message || 'Failed to fetch Instagram media');
            }

            media = (result.data || []).map((item: any) => ({
                id: item.id,
                media_type: item.media_type, // IMAGE, VIDEO, CAROUSEL_ALBUM
                media_url: item.media_url,
                thumbnail_url: item.thumbnail_url || item.media_url,
                caption: item.caption || '',
                timestamp: item.timestamp,
                permalink: item.permalink,
                comments_count: item.comments_count || 0,
                like_count: item.like_count || 0,
            }));

            paging = result.paging || null;

        } else if (platform === 'facebook') {
            // Facebook: GET /{page-id}/posts
            let postsUrl = `${META_GRAPH_URL}/${decryptedAccount.account_id}/posts?fields=id,message,full_picture,created_time,permalink_url,attachments{media_type,media,url},comments.summary(true),likes.summary(true)&limit=${limit}&access_token=${decryptedAccount.access_token}`;
            if (after) {
                postsUrl += `&after=${after}`;
            }

            console.log(`[PostsMedia] Fetching Facebook posts for page ${decryptedAccount.account_id}`);
            const response = await fetch(postsUrl, { cache: 'no-store' });
            const result = await response.json();

            if (!response.ok) {
                console.error('[PostsMedia] Facebook API error:', result.error);
                throw new Error(result.error?.message || 'Failed to fetch Facebook posts');
            }

            media = (result.data || []).map((item: any) => ({
                id: item.id,
                media_type: item.attachments?.data?.[0]?.media_type === 'video' ? 'VIDEO' : 'IMAGE',
                media_url: item.full_picture || '',
                thumbnail_url: item.full_picture || '',
                caption: item.message || '',
                timestamp: item.created_time,
                permalink: item.permalink_url,
                comments_count: item.comments?.summary?.total_count || 0,
                like_count: item.likes?.summary?.total_count || 0,
            }));

            paging = result.paging || null;
        }

        return NextResponse.json({
            media,
            paging: paging ? {
                after: paging.cursors?.after || null,
                has_next: !!paging.next,
            } : null,
            account: {
                id: decryptedAccount.id,
                account_id: decryptedAccount.account_id,
                account_name: decryptedAccount.account_name,
                platform: decryptedAccount.platform,
            }
        });

    } catch (error: any) {
        console.error('Posts media API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch posts' },
            { status: 500 }
        );
    }
}
