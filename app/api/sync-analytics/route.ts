import { NextResponse } from 'next/server'
import { canReadAnalyticsWithMetaAccount } from '@/lib/meta-account'
import { normalizeMetaGraphError } from '@/lib/meta-graph-errors'
import { buildSupabaseFunctionHeaders, getSupabaseServiceRoleKey } from '@/lib/supabase/service-key'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { getExplicitActiveWorkspace } from '@/lib/workspace-utils'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const PLATFORM = 'instagram' as const
const INSIGHTS_SCOPE = 'instagram_business_manage_insights'
const INSIGHTS_SCOPE_ALIASES = [
    INSIGHTS_SCOPE,
    'instagram_manage_insights',
] as const

function accountScopes(metadata: unknown): Set<string> {
    if (!metadata || typeof metadata !== 'object') return new Set()
    const value = metadata as {
        granted_scopes?: unknown
        granted_granular_scopes?: unknown
    }
    const direct = Array.isArray(value.granted_scopes)
        ? value.granted_scopes.filter((scope): scope is string => typeof scope === 'string')
        : []
    const granular = Array.isArray(value.granted_granular_scopes)
        ? value.granted_granular_scopes
            .map((entry) => (
                entry && typeof entry === 'object' && typeof entry.scope === 'string'
                    ? entry.scope
                    : null
            ))
            .filter((scope): scope is string => Boolean(scope))
        : []
    return new Set([...direct, ...granular])
}

export async function POST() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const activeWorkspace = await getExplicitActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'analytics:sync')

        const serviceKey = getSupabaseServiceRoleKey()
        if (!serviceKey) {
            return NextResponse.json({ error: 'Missing Supabase service key' }, { status: 500 })
        }

        const { data: accounts, error: accountsError } = await supabase
            .from('social_accounts')
            .select('id, platform, metadata')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', PLATFORM)

        if (accountsError) throw accountsError

        const instagramAccounts = accounts || []
        if (instagramAccounts.length === 0) {
            return NextResponse.json(
                {
                    error: 'No Instagram professional account is connected to this workspace.',
                    errorCode: 'instagram_not_connected',
                    missingPermissions: [],
                    requiresReconnect: false,
                },
                { status: 400 },
            )
        }

        const capableAccounts = instagramAccounts.filter((account) =>
            canReadAnalyticsWithMetaAccount(account.metadata),
        )
        if (capableAccounts.length === 0) {
            return NextResponse.json(
                {
                    error: 'Instagram analytics access is missing from the connected token. Reconnect Instagram to approve insights access.',
                    errorCode: 'meta_missing_permission',
                    missingPermissions: [INSIGHTS_SCOPE],
                    requiresReconnect: true,
                    meta: null,
                },
                { status: 403 },
            )
        }

        const functionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/sync-analytics'
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: buildSupabaseFunctionHeaders(serviceKey),
            body: JSON.stringify({
                workspaceId: activeWorkspace.id,
                platform: PLATFORM,
            }),
        })

        const raw = await response.text()
        let result: Record<string, any>
        try {
            result = raw ? JSON.parse(raw) : {}
        } catch {
            result = { error: raw }
        }

        if (!response.ok) {
            const normalized = normalizeMetaGraphError(
                typeof result.error === 'object' && result.error
                    ? result.error
                    : { message: result.error || raw || 'Failed to sync Instagram analytics' },
                { feature: 'analytics', platform: PLATFORM },
            )
            return NextResponse.json(
                {
                    error: normalized.message,
                    errorCode: normalized.code,
                    missingPermissions: normalized.missingPermissions,
                    requiresReconnect: normalized.requiresReconnect,
                    meta: normalized.meta,
                },
                { status: normalized.httpStatus },
            )
        }

        const postsSynced = Number(result?.posts?.synced || 0)
        const accountsSynced = Number(result?.accounts?.synced || 0)
        const directPostsUpserted = Number(result?.posts?.direct?.posts_upserted || 0)
        const directMetricsUpserted = Number(result?.posts?.direct?.metrics_upserted || 0)
        const directErrors = Number(result?.posts?.direct?.errors || 0)
        const warnings: string[] = []
        const suspectedMissingPermissions = new Set<string>()
        let requiresReconnect = false

        if (accountsSynced === 0) {
            const failure = Array.isArray(result?.accounts?.failures)
                ? result.accounts.failures.find((entry: any) => entry?.platform === PLATFORM)
                : null
            if (failure) {
                const normalized = normalizeMetaGraphError(failure, {
                    feature: 'analytics',
                    platform: PLATFORM,
                })
                warnings.push(normalized.message)
                normalized.missingPermissions.forEach((permission) =>
                    suspectedMissingPermissions.add(permission),
                )
                requiresReconnect = normalized.requiresReconnect
            } else {
                warnings.push('Instagram account analytics did not sync. Reconnect Instagram and try again.')
                suspectedMissingPermissions.add(INSIGHTS_SCOPE)
                requiresReconnect = true
            }
        }

        if (directPostsUpserted > 0 && directMetricsUpserted === 0) {
            warnings.push('Instagram posts were discovered, but their metrics were not synced.')
            const scopes = accountScopes(instagramAccounts[0]?.metadata)
            if (!INSIGHTS_SCOPE_ALIASES.some((scope) => scopes.has(scope))) {
                suspectedMissingPermissions.add(INSIGHTS_SCOPE)
            }
        }
        if (directErrors > 0) {
            warnings.push('Some Instagram analytics operations failed (' + directErrors + ').')
        }

        return NextResponse.json({
            success: true,
            workspaceId: activeWorkspace.id,
            ...result,
            _meta: {
                platform: PLATFORM,
                partial: warnings.length > 0,
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
                    },
                },
            },
        })
    } catch (error: unknown) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                {
                    error: error instanceof Error ? error.message : 'Forbidden',
                    errorCode: 'forbidden',
                    missingPermissions: [],
                    requiresReconnect: false,
                    meta: null,
                },
                { status: permissionStatus },
            )
        }

        console.error('Instagram analytics sync API error:', error)
        const normalized = normalizeMetaGraphError(
            {
                message: error instanceof Error
                    ? error.message
                    : 'Failed to sync Instagram analytics',
            },
            { feature: 'analytics', platform: PLATFORM },
        )
        return NextResponse.json(
            {
                error: normalized.message,
                errorCode: normalized.code,
                missingPermissions: normalized.missingPermissions,
                requiresReconnect: normalized.requiresReconnect,
                meta: normalized.meta,
            },
            { status: normalized.httpStatus },
        )
    }
}
