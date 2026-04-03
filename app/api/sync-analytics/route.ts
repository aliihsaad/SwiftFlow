import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';
import { normalizeMetaGraphError } from '@/lib/meta-graph-errors';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';

// This route proxies a long-running Supabase Edge Function call (analytics sync).
// Using Node runtime + a higher maxDuration avoids Vercel Edge timeouts (504) on larger workspaces.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
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
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'analytics:sync');

        const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceKey) {
            return NextResponse.json({ error: 'Missing Supabase service key' }, { status: 500 });
        }

        const { data: socialAccounts } = await supabase
            .from('social_accounts')
            .select('id, platform, metadata')
            .eq('workspace_id', activeWorkspace.id);
        const socialAccountsList = socialAccounts || [];
        const platforms = Array.from(new Set(socialAccountsList.map((a: any) => a.platform).filter(Boolean)));
        const platformGrantedScopes = new Map<string, Set<string>>();
        const platformExactScopesKnown = new Map<string, boolean>();
        for (const account of socialAccountsList as any[]) {
            const rawScopes = Array.isArray(account?.metadata?.granted_scopes)
                ? account.metadata.granted_scopes.filter((s: unknown) => typeof s === 'string')
                : [];
            if (account?.platform) {
                const existing = platformGrantedScopes.get(account.platform) || new Set<string>();
                rawScopes.forEach((s: string) => existing.add(s));
                platformGrantedScopes.set(account.platform, existing);
                if (Array.isArray(account?.metadata?.granted_scopes)) {
                    platformExactScopesKnown.set(account.platform, true);
                } else if (!platformExactScopesKnown.has(account.platform)) {
                    platformExactScopesKnown.set(account.platform, false);
                }
            }
        }
        const maybeAddPermissionHint = (platform: 'instagram' | 'facebook', scope: string) => {
            const exactKnown = !!platformExactScopesKnown.get(platform);
            if (!exactKnown) {
                suspectedMissingPermissions.add(scope);
                return;
            }
            if (!platformGrantedScopes.get(platform)?.has(scope)) {
                suspectedMissingPermissions.add(scope);
            }
        };

        // Call the sync-analytics Edge Function
        const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-analytics`;
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`
            },
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

        const warnings: string[] = [];
        const suspectedMissingPermissions = new Set<string>();

        if (socialAccountsList.length === 0) {
            warnings.push('No connected social accounts were found for this workspace.');
        }

        if (platforms.includes('instagram') && accountsSynced === 0) {
            warnings.push('Instagram/Facebook account-level analytics did not sync. Follower insights may be unavailable.');
            maybeAddPermissionHint('instagram', 'instagram_manage_insights');
            if (platforms.includes('facebook')) maybeAddPermissionHint('facebook', 'pages_read_engagement');
        }

        if (directPostsUpserted > 0 && directMetricsUpserted === 0) {
            warnings.push('Posts were ingested, but post metrics were not synced. Analytics may be limited to post discovery only.');
            if (platforms.includes('instagram')) maybeAddPermissionHint('instagram', 'instagram_manage_insights');
            if (platforms.includes('facebook')) maybeAddPermissionHint('facebook', 'pages_read_engagement');
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
