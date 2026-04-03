import { NextRequest, NextResponse } from 'next/server';
import { canPublishWithMetaAccount } from '@/lib/meta-account';
import { sanitizeMetaAccountMetadataForClient } from '@/lib/meta-account';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const workspaceId = searchParams.get('workspaceId');

        if (!workspaceId) {
            return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await requireWorkspacePermission(supabase, user.id, workspaceId, 'workspace:read');

        const { data: accounts, error } = await supabase
            .from('social_accounts')
            .select('platform, account_name, metadata')
            .eq('workspace_id', workspaceId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const sanitizedAccounts = (accounts || []).map((account) => ({
            platform: account.platform,
            account_name: account.account_name,
            metadata: sanitizeMetaAccountMetadataForClient(
                account.metadata && typeof account.metadata === 'object' ? account.metadata : undefined
            ),
        }));

        const status = {
            facebook: sanitizedAccounts.some((account) => account.platform === 'facebook'),
            instagram: sanitizedAccounts.some(
                (account) =>
                    account.platform === 'instagram'
                    || (account.platform === 'facebook' && Boolean(account.metadata.instagram_business_account_id))
            ),
            facebookPublishReady: sanitizedAccounts.some(
                (account) => account.platform === 'facebook' && canPublishWithMetaAccount(account.metadata, 'facebook')
            ),
            instagramPublishReady: sanitizedAccounts.some(
                (account) => account.platform === 'instagram' && canPublishWithMetaAccount(account.metadata, 'instagram')
            ),
            publishReady: sanitizedAccounts.some(
                (account) =>
                    (account.platform === 'facebook' && canPublishWithMetaAccount(account.metadata, 'facebook'))
                    || (account.platform === 'instagram' && canPublishWithMetaAccount(account.metadata, 'instagram'))
            ),
            accounts: sanitizedAccounts,
        };

        return NextResponse.json(status);
    } catch (error) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            );
        }
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to load social status' },
            { status: 500 }
        );
    }
}
