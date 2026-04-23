import { NextRequest, NextResponse } from 'next/server';
import {
    canPublishWithMetaAccount,
    canReadConnectedMediaWithMetaAccount,
    decryptMetaAccountRow,
} from '@/lib/meta-account';
import { META_GRAPH_API_BASE_URL } from '@/lib/meta-graph-version';
import { normalizeMetaGraphError, type MetaGraphErrorShape } from '@/lib/meta-graph-errors';
import { assertJsonBodySize, assertMetaGraphNodeId } from '@/lib/security/phase1-validation';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

const META_GRAPH_URL = META_GRAPH_API_BASE_URL;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PostMediaSource = 'app_managed' | 'native_discovered';

type MediaItem = {
    id: string;
    media_type: string;
    media_url: string;
    thumbnail_url: string;
    caption: string;
    timestamp: string;
    permalink: string;
    comments_count: number;
    like_count: number;
    source?: PostMediaSource;
};

type PagingInfo = {
    cursors?: {
        after?: string | null;
    };
    next?: string;
} | null;

type InstagramMediaApiItem = {
    id: string;
    media_type?: string;
    media_url?: string;
    thumbnail_url?: string;
    caption?: string;
    timestamp?: string;
    permalink?: string;
    comments_count?: number;
    like_count?: number;
};

type FacebookPostApiItem = {
    id: string;
    message?: string;
    full_picture?: string;
    created_time?: string;
    permalink_url?: string;
    attachments?: {
        data?: Array<{
            media_type?: string;
        }>;
    };
};

type PublishedPostLinkRow = {
    platform_post_id: string;
    post_id: string | null;
};

type PublishedPostMediaRow = {
    id: string;
    platform_post_id: string;
    post_id: string | null;
    permalink: string | null;
    published_at: string | null;
    platform_caption: string | null;
};

function metadataHasScope(metadata: unknown, scopeName: string): boolean {
    if (!metadata || typeof metadata !== 'object') return false;
    const value = metadata as {
        granted_scopes?: unknown;
        granted_granular_scopes?: unknown;
    };

    const grantedScopes = Array.isArray(value.granted_scopes)
        ? value.granted_scopes.filter((scope): scope is string => typeof scope === 'string')
        : [];
    const granularScopes = Array.isArray(value.granted_granular_scopes)
        ? value.granted_granular_scopes
            .filter((scope): scope is { scope: string } => typeof scope?.scope === 'string')
            .map((scope) => scope.scope)
        : [];

    return grantedScopes.includes(scopeName) || granularScopes.includes(scopeName);
}

function buildPostMediaWarning(
    graphError: MetaGraphErrorShape | null | undefined,
    ctx: { platform: string; operation: 'fetch_posts' | 'update_post' | 'delete_post' }
) {
    const normalized = normalizeMetaGraphError(graphError, {
        feature: 'posts',
        platform: ctx.platform,
        operation: ctx.operation,
    });

    return {
        error: normalized.message,
        errorCode: normalized.code,
        missingPermissions: normalized.missingPermissions,
        requiresReconnect: normalized.requiresReconnect,
        meta: normalized.meta,
    };
}

function buildFacebookDiscoveryWarning(
    graphError: MetaGraphErrorShape | null | undefined,
    metadata: unknown,
) {
    const warning = buildPostMediaWarning(graphError, { platform: 'facebook', operation: 'fetch_posts' });
    const hasRecordedReadScope = metadataHasScope(metadata, 'pages_read_engagement');

    if (warning.errorCode === 'meta_missing_permission' && hasRecordedReadScope) {
        return {
            ...warning,
            error: 'Meta rejected native Facebook Page discovery for this Page even though pages_read_engagement is recorded on the OAuth grant. Showing cached/app-managed posts only. Check that this Facebook user has Page asset access in Meta Business Suite and that the Page was granted to SwiftFlow in Facebook Business Integrations.',
            missingPermissions: [],
            requiresReconnect: false,
        };
    }

    return warning;
}

function buildFacebookCapabilityWarning(metadata: unknown) {
    const hasRecordedReadScope = metadataHasScope(metadata, 'pages_read_engagement');

    return {
        error: hasRecordedReadScope
            ? 'Native Facebook Page discovery is unavailable for this Page token even though pages_read_engagement is recorded. Showing cached/app-managed posts only.'
            : 'Native Facebook Page discovery is unavailable because the current OAuth grant does not include pages_read_engagement. Showing cached/app-managed posts only.',
        errorCode: 'meta_missing_permission',
        missingPermissions: hasRecordedReadScope ? [] : ['pages_read_engagement'],
        requiresReconnect: !hasRecordedReadScope,
        meta: null,
    };
}

function requiredPostMediaPermissions(platform: string, mode: 'read' | 'manage'): string[] {
    if (platform === 'facebook') {
        return [mode === 'read' ? 'pages_read_engagement' : 'pages_manage_posts'];
    }

    return mode === 'read' ? ['instagram_basic'] : ['instagram_content_publish'];
}

function metaPostErrorResponse(
    graphError: MetaGraphErrorShape | null | undefined,
    ctx: { platform: string; operation: 'fetch_posts' | 'update_post' | 'delete_post' }
) {
    const warning = buildPostMediaWarning(graphError, ctx);

    return NextResponse.json(
        warning,
        { status: warning.errorCode === 'meta_auth_invalid_token' ? 401 : warning.errorCode === 'meta_rate_limited' ? 429 : warning.errorCode === 'meta_missing_permission' ? 403 : 502 }
    );
}

function postMediaCapabilityErrorResponse(platform: string, mode: 'read' | 'manage') {
    return NextResponse.json(
        {
            error: mode === 'read'
                ? 'Post media access is not available for this connected account'
                : 'Post management is not available for this connected account',
            errorCode: 'meta_missing_permission',
            missingPermissions: requiredPostMediaPermissions(platform, mode),
            requiresReconnect: false,
            media: mode === 'read' ? [] : undefined,
        },
        { status: 403 }
    );
}

async function loadCachedFacebookPosts(params: {
    socialAccountId: string;
    limit: number;
}): Promise<MediaItem[]> {
    try {
        const supabaseAdmin = createAdminClient();
        const { data, error } = await supabaseAdmin
            .from('published_posts')
            .select('id, platform_post_id, post_id, permalink, published_at, platform_caption')
            .eq('social_account_id', params.socialAccountId)
            .eq('platform', 'facebook')
            .order('published_at', { ascending: false })
            .limit(params.limit);

        if (error) {
            console.error('[PostsMedia] Failed to load cached Facebook posts:', error);
            return [];
        }

        return ((data || []) as PublishedPostMediaRow[])
            .filter((row) => typeof row.platform_post_id === 'string' && row.platform_post_id.length > 0)
            .map((row) => ({
                id: row.platform_post_id,
                media_type: 'POST',
                media_url: '',
                thumbnail_url: '',
                caption: row.platform_caption || 'Facebook Page post',
                timestamp: row.published_at || '',
                permalink: row.permalink || '',
                comments_count: 0,
                like_count: 0,
                source: row.post_id ? 'app_managed' : 'native_discovered',
            }));
    } catch (error) {
        console.error('[PostsMedia] Cached Facebook posts fallback unavailable:', error);
        return [];
    }
}

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

        const canReadConnectedMedia = canReadConnectedMediaWithMetaAccount(
            decryptedAccount.metadata,
            platform === 'facebook' ? 'facebook' : 'instagram',
        );

        if (!canReadConnectedMedia && platform !== 'facebook') {
            return postMediaCapabilityErrorResponse(platform, 'read');
        }

        let media: MediaItem[] = [];
        let paging: PagingInfo = null;

        if (platform === 'instagram') {
            // Instagram: GET /{ig-user-id}/media
            let mediaUrl = `${META_GRAPH_URL}/${decryptedAccount.account_id}/media?fields=id,media_type,media_url,thumbnail_url,caption,timestamp,permalink,comments_count,like_count&limit=${limit}&access_token=${decryptedAccount.access_token}`;
            if (after) {
                mediaUrl += `&after=${after}`;
            }

            console.log(`[PostsMedia] Fetching Instagram media for account ${decryptedAccount.account_id}`);
            const response = await fetch(mediaUrl, { cache: 'no-store' });
            const result = await response.json() as { data?: InstagramMediaApiItem[]; paging?: PagingInfo; error?: { message?: string } };

            if (!response.ok) {
                console.error('[PostsMedia] Instagram API error:', result.error);
                throw new Error(result.error?.message || 'Failed to fetch Instagram media');
            }

            media = (result.data || []).map((item) => ({
                id: item.id,
                media_type: item.media_type || 'IMAGE', // IMAGE, VIDEO, CAROUSEL_ALBUM
                media_url: item.media_url || '',
                thumbnail_url: item.thumbnail_url || item.media_url || '',
                caption: item.caption || '',
                timestamp: item.timestamp || '',
                permalink: item.permalink || '',
                comments_count: item.comments_count || 0,
                like_count: item.like_count || 0,
            }));

            paging = result.paging || null;

        } else if (platform === 'facebook') {
            if (!canReadConnectedMedia) {
                const cachedMedia = await loadCachedFacebookPosts({
                    socialAccountId: decryptedAccount.id,
                    limit,
                });
                console.warn('[PostsMedia] Facebook read capability missing; returning cached/app-managed fallback', {
                    cachedCount: cachedMedia.length,
                });

                return NextResponse.json({
                    media: cachedMedia,
                    paging: null,
                    partial: true,
                    contentDiscoveryUnavailable: buildFacebookCapabilityWarning(decryptedAccount.metadata),
                    account: {
                        id: decryptedAccount.id,
                        account_id: decryptedAccount.account_id,
                        account_name: decryptedAccount.account_name,
                        platform: decryptedAccount.platform,
                    }
                });
            }

            // Facebook: keep the discovery request limited to Page-owned post fields.
            // Engagement summaries are intentionally not requested here because they can
            // require additional Page/user-content permissions and break the whole list.
            let postsUrl = `${META_GRAPH_URL}/${decryptedAccount.account_id}/posts?fields=id,message,full_picture,created_time,permalink_url,attachments{media_type}&limit=${limit}&access_token=${decryptedAccount.access_token}`;
            if (after) {
                postsUrl += `&after=${after}`;
            }

            console.log(`[PostsMedia] Fetching Facebook posts for page ${decryptedAccount.account_id}`);
            const response = await fetch(postsUrl, { cache: 'no-store' });
            const result = await response.json() as { data?: FacebookPostApiItem[]; paging?: PagingInfo; error?: MetaGraphErrorShape };

            if (!response.ok) {
                console.error('[PostsMedia] Facebook API error:', result.error);
                const cachedMedia = await loadCachedFacebookPosts({
                    socialAccountId: decryptedAccount.id,
                    limit,
                });
                console.warn('[PostsMedia] Facebook native discovery failed; returning cached/app-managed fallback', {
                    cachedCount: cachedMedia.length,
                    graphCode: result.error?.code,
                });

                return NextResponse.json({
                    media: cachedMedia,
                    paging: null,
                    partial: true,
                    contentDiscoveryUnavailable: buildFacebookDiscoveryWarning(result.error, decryptedAccount.metadata),
                    account: {
                        id: decryptedAccount.id,
                        account_id: decryptedAccount.account_id,
                        account_name: decryptedAccount.account_name,
                        platform: decryptedAccount.platform,
                    }
                });
            }

            const fetchedPosts = result.data || [];
            const platformPostIds = fetchedPosts
                .map((item) => item?.id)
                .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);

            let sourceByPlatformPostId = new Map<string, PostMediaSource>();
            if (platformPostIds.length > 0) {
                const { data: linkedRows, error: linkedRowsError } = await supabase
                    .from('published_posts')
                    .select('platform_post_id, post_id')
                    .eq('social_account_id', decryptedAccount.id)
                    .eq('platform', 'facebook')
                    .in('platform_post_id', platformPostIds);

                if (linkedRowsError) {
                    console.error('[PostsMedia] Failed to load published_posts source mapping:', linkedRowsError);
                } else {
                    sourceByPlatformPostId = new Map(
                        ((linkedRows || []) as PublishedPostLinkRow[])
                            .filter((row) => typeof row?.platform_post_id === 'string')
                            .map((row) => [
                                row.platform_post_id,
                                row?.post_id ? 'app_managed' : 'native_discovered',
                            ])
                    );
                }
            }

            media = fetchedPosts.map((item) => ({
                id: item.id,
                media_type: item.attachments?.data?.[0]?.media_type === 'video' ? 'VIDEO' : 'IMAGE',
                media_url: item.full_picture || '',
                thumbnail_url: item.full_picture || '',
                caption: item.message || '',
                timestamp: item.created_time || '',
                permalink: item.permalink_url || '',
                comments_count: 0,
                like_count: 0,
                source: sourceByPlatformPostId.get(item.id) || 'native_discovered',
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

    } catch (error: unknown) {
        console.error('Posts media API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch posts' },
            { status: 500 }
        );
    }
}

// PATCH - Update a Facebook Page post message
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write');

        assertJsonBodySize(request, 128 * 1024);
        const body = await request.json();
        const platform = typeof body?.platform === 'string' ? body.platform : 'facebook';
        const postId = assertMetaGraphNodeId(body?.postId, 'postId');
        const message = typeof body?.message === 'string' ? body.message.trim() : '';

        if (platform !== 'facebook') {
            return NextResponse.json({ error: 'Post editing is currently available for Facebook Page posts only' }, { status: 400 });
        }
        if (!message) {
            return NextResponse.json({ error: 'message is required' }, { status: 400 });
        }
        if (message.length > 63206) {
            return NextResponse.json({ error: 'message is too long for a Facebook Page post' }, { status: 400 });
        }

        const { data: account, error: accountError } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', platform)
            .single();
        const decryptedAccount = account ? decryptMetaAccountRow(account) : null;

        if (accountError || !decryptedAccount?.access_token) {
            return NextResponse.json({ error: 'No Facebook account or token available' }, { status: 400 });
        }

        if (!canPublishWithMetaAccount(decryptedAccount.metadata, 'facebook')) {
            return postMediaCapabilityErrorResponse(platform, 'manage');
        }

        const response = await fetch(`${META_GRAPH_URL}/${postId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                message,
                access_token: decryptedAccount.access_token,
            }),
        });
        const result = await response.json() as { success?: boolean; error?: MetaGraphErrorShape };

        if (!response.ok) {
            console.error('[PostsMedia] Facebook post update API error:', result?.error);
            return metaPostErrorResponse(result?.error, { platform: 'facebook', operation: 'update_post' });
        }

        const supabaseAdmin = createAdminClient();
        const { error: updateError } = await supabaseAdmin
            .from('published_posts')
            .update({ platform_caption: message })
            .eq('social_account_id', decryptedAccount.id)
            .eq('platform', 'facebook')
            .eq('platform_post_id', postId);
        if (updateError) {
            console.error('[PostsMedia] Failed to update local Facebook post caption:', updateError);
        }

        return NextResponse.json({ success: true, postId, message });
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid postId|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: error instanceof Error ? error.message : 'Forbidden' }, { status: permissionStatus });
        }
        console.error('Update Facebook post API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to update Facebook post' },
            { status: 500 }
        );
    }
}

// DELETE - Delete a Facebook Page post
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write');

        const { searchParams } = new URL(request.url);
        const platform = searchParams.get('platform') || 'facebook';
        const rawPostId = searchParams.get('postId');

        if (platform !== 'facebook') {
            return NextResponse.json({ error: 'Post deletion is currently available for Facebook Page posts only' }, { status: 400 });
        }
        if (!rawPostId) {
            return NextResponse.json({ error: 'postId is required' }, { status: 400 });
        }
        const postId = assertMetaGraphNodeId(rawPostId, 'postId');

        const { data: account, error: accountError } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', platform)
            .single();
        const decryptedAccount = account ? decryptMetaAccountRow(account) : null;

        if (accountError || !decryptedAccount?.access_token) {
            return NextResponse.json({ error: 'No Facebook account or token available' }, { status: 400 });
        }

        if (!canPublishWithMetaAccount(decryptedAccount.metadata, 'facebook')) {
            return postMediaCapabilityErrorResponse(platform, 'manage');
        }

        const deleteUrl = new URL(`${META_GRAPH_URL}/${postId}`);
        deleteUrl.searchParams.set('access_token', decryptedAccount.access_token);
        const response = await fetch(deleteUrl, { method: 'DELETE' });
        const result = await response.json() as { success?: boolean; error?: MetaGraphErrorShape };

        if (!response.ok) {
            console.error('[PostsMedia] Facebook post delete API error:', result?.error);
            return metaPostErrorResponse(result?.error, { platform: 'facebook', operation: 'delete_post' });
        }

        const supabaseAdmin = createAdminClient();
        const { error: deleteError } = await supabaseAdmin
            .from('published_posts')
            .delete()
            .eq('social_account_id', decryptedAccount.id)
            .eq('platform', 'facebook')
            .eq('platform_post_id', postId);
        if (deleteError) {
            console.error('[PostsMedia] Failed to delete local Facebook post record:', deleteError);
        }

        return NextResponse.json({ success: true, postId });
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid postId/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: error instanceof Error ? error.message : 'Forbidden' }, { status: permissionStatus });
        }
        console.error('Delete Facebook post API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete Facebook post' },
            { status: 500 }
        );
    }
}
