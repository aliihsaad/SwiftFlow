import { NextRequest, NextResponse } from 'next/server';
import {
    canReadConnectedMediaWithMetaAccount,
    decryptMetaAccountRow,
} from '@/lib/meta-account';
import { normalizeMetaGraphError, type MetaGraphErrorShape } from '@/lib/meta-graph-errors';
import { getMetaGraphApiBaseUrl } from '@/lib/meta-graph-version';
import { assertMetaGraphNodeId } from '@/lib/security/phase1-validation';
import { getActiveWorkspace } from '@/lib/workspace-utils';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PLATFORM = 'instagram' as const;

type PagingInfo = {
    cursors?: {
        after?: string | null;
    };
    next?: string;
} | null;

type InstagramMediaApiItem = {
    id: string;
    media_type?: string;
    media_product_type?: string;
    media_url?: string;
    thumbnail_url?: string;
    caption?: string;
    timestamp?: string;
    permalink?: string;
    comments_count?: number;
    like_count?: number;
};

type InstagramMediaApiResponse = {
    data?: InstagramMediaApiItem[];
    paging?: PagingInfo;
    error?: MetaGraphErrorShape;
};

export async function GET(request: NextRequest) {
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

        const { searchParams } = new URL(request.url);
        const parsedLimit = Number.parseInt(searchParams.get('limit') || '25', 10);
        const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 25;
        const after = searchParams.get('after') || '';

        const { data: account, error: accountError } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', PLATFORM)
            .single();

        if (accountError || !account) {
            return NextResponse.json(
                { error: 'No Instagram account connected', media: [] },
                { status: 200 },
            );
        }

        const decryptedAccount = decryptMetaAccountRow(account);
        if (!decryptedAccount.access_token) {
            return NextResponse.json(
                { error: 'No access token available for this Instagram account', media: [] },
                { status: 400 },
            );
        }

        if (!canReadConnectedMediaWithMetaAccount(decryptedAccount.metadata, PLATFORM)) {
            return NextResponse.json(
                {
                    error: 'Instagram media access is not available for this connected account',
                    errorCode: 'meta_missing_permission',
                    missingPermissions: ['instagram_business_basic'],
                    requiresReconnect: true,
                    media: [],
                },
                { status: 403 },
            );
        }

        const accountId = assertMetaGraphNodeId(decryptedAccount.account_id, 'accountId');
        const graphBaseUrl = getMetaGraphApiBaseUrl(decryptedAccount.metadata?.connection_method);
        const graphParams = new URLSearchParams({
            fields: 'id,media_type,media_product_type,media_url,thumbnail_url,caption,timestamp,permalink,comments_count,like_count',
            limit: String(limit),
            access_token: decryptedAccount.access_token,
        });
        if (after) {
            graphParams.set('after', after);
        }

        const response = await fetch(
            graphBaseUrl + '/' + accountId + '/media?' + graphParams.toString(),
            { cache: 'no-store' },
        );
        const result = await response.json() as InstagramMediaApiResponse;

        if (!response.ok) {
            const normalized = normalizeMetaGraphError(result.error, {
                feature: 'posts',
                platform: PLATFORM,
                operation: 'fetch_posts',
            });

            return NextResponse.json(
                {
                    error: normalized.message,
                    errorCode: normalized.code,
                    missingPermissions: normalized.missingPermissions,
                    requiresReconnect: normalized.requiresReconnect,
                    meta: normalized.meta,
                    media: [],
                },
                { status: normalized.httpStatus },
            );
        }

        const media = (result.data || []).map((item) => ({
            id: item.id,
            media_type: item.media_type || 'IMAGE',
            media_product_type: item.media_product_type || '',
            media_url: item.media_url || '',
            thumbnail_url: item.thumbnail_url || item.media_url || '',
            caption: item.caption || '',
            timestamp: item.timestamp || '',
            permalink: item.permalink || '',
            comments_count: item.comments_count || 0,
            like_count: item.like_count || 0,
        }));

        return NextResponse.json({
            media,
            paging: result.paging ? {
                after: result.paging.cursors?.after || null,
                has_next: Boolean(result.paging.next),
            } : null,
            account: {
                id: decryptedAccount.id,
                account_id: decryptedAccount.account_id,
                account_name: decryptedAccount.account_name,
                platform: PLATFORM,
            },
        });
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid accountId/i.test(error.message)) {
            return NextResponse.json({ error: error.message, media: [] }, { status: 400 });
        }

        console.error('Instagram media API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch Instagram posts', media: [] },
            { status: 500 },
        );
    }
}
