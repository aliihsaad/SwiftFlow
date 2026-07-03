import { NextRequest, NextResponse } from 'next/server';
import { canPublishWithMetaAccount, canReadConnectedMediaWithMetaAccount, sanitizeMetaAccountMetadataForClient } from '@/lib/meta-account';
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
        const facebookAccount = sanitizedAccounts.find((account) => account.platform === 'facebook');
        const facebookGrantedScopes = Array.isArray(facebookAccount?.metadata?.granted_scopes)
            ? facebookAccount.metadata.granted_scopes.filter((scope): scope is string => typeof scope === 'string')
            : [];
        const facebookRequiredReadScopes = ['pages_read_engagement'];

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
            facebookReadReady: sanitizedAccounts.some(
                (account) => account.platform === 'facebook' && canReadConnectedMediaWithMetaAccount(account.metadata, 'facebook')
            ),
            facebookGrantedScopes,
            facebookMissingReadScopes: facebookRequiredReadScopes.filter((scope) => !facebookGrantedScopes.includes(scope)),
            instagramPublishReady: sanitizedAccounts.some(
                (account) => account.platform === 'instagram' && canPublishWithMetaAccount(account.metadata, 'instagram')
            ),
            publishReady: sanitizedAccounts.some(
                (account) =>
                    (account.platform === 'facebook' && canPublishWithMetaAccount(account.metadata, 'facebook'))
                    || (account.platform === 'instagram' && canPublishWithMetaAccount(account.metadata, 'instagram'))
            ),
            // Worst token health across accounts, from the daily token-health
            // sweep. null = not checked yet.
            tokenHealth: sanitizedAccounts.reduce<string | null>((worst, account) => {
                const health = account.metadata.token_health;
                if (health === 'invalid' || worst === 'invalid') return 'invalid';
                if (health === 'expiring_soon' || worst === 'expiring_soon') return 'expiring_soon';
                return health ?? worst;
            }, null),
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
