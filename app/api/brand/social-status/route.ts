import { NextRequest, NextResponse } from 'next/server';
import { sanitizeMetaAccountMetadataForClient } from '@/lib/meta-account';
import { deriveInstagramAutomationHealth } from '@/lib/instagram-onboarding';
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
            .select('platform, account_name, account_id, token_expires_at, metadata')
            .eq('workspace_id', workspaceId)
            .eq('platform', 'instagram');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const sanitizedAccounts = (accounts || []).map((account) => ({
            platform: account.platform,
            account_name: account.account_name,
            account_id: account.account_id,
            token_expires_at: account.token_expires_at,
            metadata: sanitizeMetaAccountMetadataForClient(
                account.metadata && typeof account.metadata === 'object' ? account.metadata : undefined
            ),
        }));
        const instagramAccount = sanitizedAccounts.find((account) => account.platform === 'instagram');
        const instagramAutomationHealth = deriveInstagramAutomationHealth({
            connected: Boolean(instagramAccount),
            accountType: instagramAccount?.metadata.account_type,
            grantedScopes: instagramAccount?.metadata.granted_scopes,
            tokenHealth: instagramAccount?.metadata.token_health,
            webhookStatus: instagramAccount?.metadata.webhook_subscription_status,
            subscribedFields: instagramAccount?.metadata.webhook_subscribed_fields,
        });

        const status = {
            instagram: Boolean(instagramAccount),
            instagramAutomationHealth,
            instagramConnectionMethod: instagramAccount?.metadata.connection_method ?? null,
            instagramWebhookStatus: instagramAccount?.metadata.webhook_subscription_status ?? null,
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
