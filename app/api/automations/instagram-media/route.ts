import { NextRequest, NextResponse } from 'next/server';
import { canReadConnectedMediaWithMetaAccount, decryptMetaAccountRow } from '@/lib/meta-account';
import { getMetaGraphApiBaseUrl } from '@/lib/meta-graph-version';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
type InstagramMediaApiItem = {
    id: string;
    media_type: string;
    media_url?: string;
    thumbnail_url?: string;
    caption?: string;
    timestamp?: string;
    permalink?: string;
};

type InstagramMediaApiResponse = {
    data?: InstagramMediaApiItem[];
    error?: {
        message?: string;
    };
};


// GET - Fetch Instagram media for post selection
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
        const accountId = searchParams.get('account_id');
        const limit = parseInt(searchParams.get('limit') || '25');

        if (!accountId) {
            return NextResponse.json(
                { error: 'account_id is required' },
                { status: 400 }
            );
        }

        // Get the account details
        const { data: account, error: accountError } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('id', accountId)
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', 'instagram')
            .single();

        if (accountError || !account) {
            return NextResponse.json(
                { error: 'Account not found' },
                { status: 404 }
            );
        }
        const decryptedAccount = decryptMetaAccountRow(account);
        const graphBaseUrl = getMetaGraphApiBaseUrl(
            decryptedAccount.metadata?.connection_method
        );

        if (!decryptedAccount.access_token) {
            return NextResponse.json(
                { error: 'No access token available for this account' },
                { status: 400 }
            );
        }

        if (!canReadConnectedMediaWithMetaAccount(decryptedAccount.metadata, 'instagram')) {
            return NextResponse.json(
                {
                    error: 'Media access is not available for this connected account',
                    errorCode: 'meta_missing_permission',
                    missingPermissions: ['instagram_basic'],
                    requiresReconnect: false,
                },
                { status: 403 }
            );
        }

        // Fetch media from Instagram Graph API
        const mediaUrl = `${graphBaseUrl}/${decryptedAccount.account_id}/media?fields=id,media_type,media_url,thumbnail_url,caption,timestamp,permalink&limit=${limit}&access_token=${decryptedAccount.access_token}`;

        const response = await fetch(mediaUrl, { cache: 'no-store' });
        const result = await response.json() as InstagramMediaApiResponse;

        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to fetch Instagram media');
        }

        // Transform the response
        const media = (result.data || []).map((item) => ({
            id: item.id,
            media_type: item.media_type,
            media_url: item.media_url,
            thumbnail_url: item.thumbnail_url || item.media_url,
            caption: item.caption,
            timestamp: item.timestamp,
            permalink: item.permalink
        }));

        return NextResponse.json({
            media
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch Instagram media';
        console.error('Get Instagram media API error:', error);
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
