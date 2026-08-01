import { NextResponse } from 'next/server';
import { canReadAnalyticsWithMetaAccount } from '@/lib/meta-account';
import { createClient } from '@/utils/supabase/server';
import { getExplicitActiveWorkspace } from '@/lib/workspace-utils';
import { normalizeMetaGraphError } from '@/lib/meta-graph-errors';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';
import { buildSupabaseFunctionHeaders, getSupabaseServiceRoleKey } from '@/lib/supabase/service-key';

// This route proxies a long-running Supabase Edge Function call (analytics sync).
// Using Node runtime + a higher maxDuration avoids Vercel Edge timeouts (504) on larger workspaces.
export const runtime = 'nodejs';
export const maxDuration = 60;
const ANALYTICS_SCOPE_ALIASES = {
    instagram: ['instagram_business_manage_insights', 'instagram_manage_insights'],
    facebook: ['pages_read_engagement'],
} as const;


export async function POST() {
    try {
        const supabase = await createClient();

        // Auth check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get active workspace
        const activeWorkspace = await getExplicitActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'analytics:sync');

        const serviceKey = getSupabaseServiceRoleKey();
        if (!serviceKey) {
            return NextResponse.json({ error: 'Missing Supabase service key' }, { status: 500 });
        }

        const { data: socialAccounts } = await supabase
            .from('social_accounts')
            .select('id, platform, metadata')
            .eq('workspace_id', activeWorkspace.id);
        const socialAccountsList = socialAccounts || [];
        const platforms = Array.from(new Set(socialAccountsList.map((a: any) => a.platform).filter(Boolean)));
        const analyticsCapableAccounts = socialAccountsList.filter((account: any) =>
            canReadAnalyticsWithMetaAccount(account?.metadata),
        );
        const platformGrantedScopes = new Map<string, Set<string>>();
        const platformExactScopesKnown = new Map<string, boolean>();
        for (const account of socialAccountsList as any[]) {
            const grantedScopes = Array.isArray(account?.metadata?.granted_scopes)
                ? account.metadata.granted_scopes.filter((s: unknown) => typeof s === 'string')
                : [];
            const granularScopes = Array.isArray(account?.metadata?.granted_granular_scopes)
                ? account.metadata.granted_granular_scopes
                    .map((entry: any) => entry?.scope)
                    .filter((scope: unknown) => typeof scope === 'string')
                : [];
            const rawScopes = Array.from(new Set([...grantedScopes, ...granularScopes]));
            if (account?.platform) {
                const existing = platformGrantedScopes.get(account.platform) || new Set<string>();
                rawScopes.forEach((s: string) => existing.add(s));
                platformGrantedScopes.set(account.platform, existing);
                if (Array.isArray(account?.metadata?.granted_scopes)
                    || Array.isArray(account?.metadata?.granted_granular_scopes)) {
                    platformExactScopesKnown.set(account.platform, true);
                } else if (!platformExactScopesKnown.has(account.platform)) {
                    platformExactScopesKnown.set(account.platform, false);
                }
            }
        }
        const suspectedMissingPermissions = new Set<string>();
        const maybeAddPermissionHint = (platform: 'instagram' | 'facebook', force = false) => {
            const acceptedScopes = ANALYTICS_SCOPE_ALIASES[platform];
            const preferredScope = acceptedScopes[0];
            const exactKnown = !!platformExactScopesKnown.get(platform);
            const hasAcceptedScope = acceptedScopes.some((scope) => platformGrantedScopes.get(platform)?.has(scope));

            if (force || !exactKnown || !hasAcceptedScope) {
                suspectedMissingPermissions.add(preferredScope);
            }
        };


        if (socialAccountsList.length > 0 && analyticsCapableAccounts.length === 0) {
            if (platforms.includes('instagram')) maybeAddPermissionHint('instagram');
            if (platforms.includes('facebook')) maybeAddPermissionHint('facebook');
            const permissionError = platforms.includes('instagram')
                ? 'Instagram analytics access is missing from the connected token. Reconnect the account to approve insights access.'
                : 'Analytics access is missing from the connected token. Reconnect the account to approve the required permission.'

            return NextResponse.json(
                {
                    error: permissionError,
                    errorCode: 'meta_missing_permission',
                    missingPermissions: Array.from(suspectedMissingPermissions),
                    requiresReconnect: true,
                    meta: null,
                },
                { status: 403 }
            );
        }

        // Call the sync-analytics Edge Function
        const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-analytics`;
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: buildSupabaseFunctionHeaders(serviceKey),
            body: JSON.stringify({
                workspaceId: activeWorkspace.id
            })
        });

        const raw = await response.text();
        let result: any = {};
        try {
            result = raw ? JSON.parse(raw) : {};
        } catch {
            result = { error: raw };
        }
        if (!response.ok) {
            const normalized = normalizeMetaGraphError(
                typeof result?.error === 'object' && result?.error ? result.error : { message: result?.error || raw || 'Failed to sync analytics' },
                { feature: 'analytics' }
            );
            return NextResponse.json(
                {
                    error: normalized.message,
                    errorCode: normalized.code,
                    missingPermissions: normalized.missingPermissions,
                    requiresReconnect: normalized.requiresReconnect,
                    meta: normalized.meta,
                },
                { status: normalized.httpStatus }
            );
        }

        const postsSynced = Number(result?.posts?.synced || 0);
        const accountsSynced = Number(result?.accounts?.synced || 0);
        const directPostsUpserted = Number(result?.posts?.direct?.posts_upserted || 0);
        const directMetricsUpserted = Number(result?.posts?.direct?.metrics_upserted || 0);
        const directErrors = Number(result?.posts?.direct?.errors || 0);
        const accountFailures = Array.isArray(result?.accounts?.failures)
            ? result.accounts.failures
            : [];
        const normalizedAccountFailures = accountFailures.map((failure: any) => ({
            platform: failure?.platform,
            normalized: normalizeMetaGraphError(
                {
                    message: failure?.message,
                    code: failure?.code,
                    error_subcode: failure?.error_subcode,
                    type: failure?.type,
                },
                { feature: 'analytics' },
            ),
        }));

        const warnings: string[] = [];
        let requiresReconnect = false;

        if (socialAccountsList.length === 0) {
            warnings.push('No connected social accounts were found for this workspace.');
        }

        if (platforms.includes('instagram') && accountsSynced === 0) {
            const instagramFailure = normalizedAccountFailures.find(
                (failure: any) => failure.platform === 'instagram',
            )?.normalized;
            if (instagramFailure) {
                warnings.push(instagramFailure.message);
                instagramFailure.missingPermissions.forEach((permission: string) =>
                    suspectedMissingPermissions.add(permission),
                );
                requiresReconnect = instagramFailure.requiresReconnect;
            } else {
                warnings.push('Instagram account-level analytics did not sync. Reconnect once so the current token includes insights access.');
                maybeAddPermissionHint('instagram', true);
                requiresReconnect = true;
            }
        }

        if (directPostsUpserted > 0 && directMetricsUpserted === 0) {
            warnings.push('Posts were ingested, but post metrics were not synced. Analytics may be limited to post discovery only.');
            if (platforms.includes('instagram')) maybeAddPermissionHint('instagram');
            if (platforms.includes('facebook')) maybeAddPermissionHint('facebook');
        }

        if (directErrors > 0) {
            warnings.push(`Some analytics sync operations failed (${directErrors}). Data may be partially updated.`);
        }

        const partial = warnings.length > 0;

        return NextResponse.json({
            success: true,
            workspaceId: activeWorkspace.id,
            ...result,
            _meta: {
                partial,
                requiresReconnect,
                warnings,
                suspectedMissingPermissions: Array.from(suspectedMissingPermissions),
                sync: {
                    postsSynced,
                    accountsSynced,
                    direct: {
                        postsUpserted: directPostsUpserted,
                        metricsUpserted: directMetricsUpserted,
                        errors: directErrors,
                    }
                }
            }
        });

    } catch (error: any) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json(
                {
                    error: error.message || 'Forbidden',
                    errorCode: 'forbidden',
                    missingPermissions: [],
                    requiresReconnect: false,
                    meta: null,
                },
                { status: permissionStatus }
            );
        }
        console.error('Sync analytics API error:', error);
        const normalized = normalizeMetaGraphError(
            { message: error.message || 'Failed to sync analytics' },
            { feature: 'analytics' }
        );
        return NextResponse.json(
            {
                error: normalized.message,
                errorCode: normalized.code,
                missingPermissions: normalized.missingPermissions,
                requiresReconnect: normalized.requiresReconnect,
                meta: normalized.meta,
            },
            { status: normalized.httpStatus }
        );
    }
}
