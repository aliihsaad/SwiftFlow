import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getDefaultModelForProvider } from '@/lib/ai-models';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';
import { encryptSecretIfNeeded, isEncryptedSecret, normalizeOptionalSecretInput } from '@/lib/secret-crypto';
import { assertJsonBodySize, assertUuid, sanitizeWorkspaceSettingsPayload } from '@/lib/security/phase1-validation';

/**
 * GET /api/workspace/settings
 * Fetch workspace settings
 */

function sanitizeWorkspaceSettingsForClient<T extends Record<string, unknown>>(row: T): T & {
    openrouter_api_key: null
    gemini_api_key: null
    openai_api_key: null
    has_openrouter_api_key: boolean
    has_gemini_api_key: boolean
    has_openai_api_key: boolean
} {
    return {
        ...row,
        openrouter_api_key: null,
        gemini_api_key: null,
        openai_api_key: null,
        has_openrouter_api_key: typeof row.openrouter_api_key === 'string' && row.openrouter_api_key.length > 0,
        has_gemini_api_key: typeof row.gemini_api_key === 'string' && row.gemini_api_key.length > 0,
        has_openai_api_key: typeof row.openai_api_key === 'string' && row.openai_api_key.length > 0,
    }
}

function buildWorkspaceSettingsUpdatePayload(settings: Record<string, unknown>) {
    const payload: Record<string, unknown> = { ...settings }

    if ('openrouter_api_key' in settings) {
        const normalized = normalizeOptionalSecretInput(settings.openrouter_api_key)
        if (normalized === null) {
            delete payload.openrouter_api_key
        } else {
            payload.openrouter_api_key = encryptSecretIfNeeded(normalized)
        }
    }
    if ('gemini_api_key' in settings) {
        const normalized = normalizeOptionalSecretInput(settings.gemini_api_key)
        if (normalized === null) {
            delete payload.gemini_api_key
        } else {
            payload.gemini_api_key = encryptSecretIfNeeded(normalized)
        }
    }
    if ('openai_api_key' in settings) {
        const normalized = normalizeOptionalSecretInput(settings.openai_api_key)
        if (normalized === null) {
            delete payload.openai_api_key
        } else {
            payload.openai_api_key = encryptSecretIfNeeded(normalized)
        }
    }
    if (typeof payload.ai_text_model_name === 'string') {
        payload.ai_text_model_name = payload.ai_text_model_name.trim()
        payload.ai_model_name = payload.ai_text_model_name
    } else if (typeof payload.ai_model_name === 'string') {
        payload.ai_model_name = payload.ai_model_name.trim()
        payload.ai_text_model_name = payload.ai_model_name
    }
    if (typeof payload.ai_image_model_name === 'string') {
        payload.ai_image_model_name = payload.ai_image_model_name.trim() || null
    }

    return payload
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
        return NextResponse.json(
            { error: 'Missing workspaceId parameter' },
            { status: 400 }
        );
    }

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await requireWorkspacePermission(supabase, user.id, assertUuid(workspaceId, 'workspaceId'), 'workspace:read');

        const supabaseAdmin = createAdminClient();
        const { data, error } = await supabaseAdmin
            .from('workspace_settings')
            .select('*')
            .eq('workspace_id', workspaceId)
            .maybeSingle();

        if (error) {
            console.error('[WORKSPACE_SETTINGS] Error fetching:', error);
            return NextResponse.json(
                { error: 'Failed to fetch settings' },
                { status: 500 }
            );
        }

        // Return empty object with defaults if no settings exist
        if (!data) {
            return NextResponse.json({
                workspace_id: workspaceId,
                ai_provider: 'openrouter',
                ai_text_model_name: getDefaultModelForProvider('openrouter'),
                ai_image_model_name: null,
                ai_model_name: getDefaultModelForProvider('openrouter'),
                openrouter_api_key: null,
                gemini_api_key: null,
                openai_api_key: null,
                has_openrouter_api_key: false,
                has_gemini_api_key: false,
                has_openai_api_key: false,
                timezone: 'UTC',
                default_language: 'en'
            });
        }

        const needsMigration =
            (typeof data.openrouter_api_key === 'string' && data.openrouter_api_key.length > 0 && !isEncryptedSecret(data.openrouter_api_key)) ||
            (typeof data.gemini_api_key === 'string' && data.gemini_api_key.length > 0 && !isEncryptedSecret(data.gemini_api_key)) ||
            (typeof data.openai_api_key === 'string' && data.openai_api_key.length > 0 && !isEncryptedSecret(data.openai_api_key))

        if (needsMigration) {
            try {
                await supabaseAdmin
                    .from('workspace_settings')
                    .update({
                        openrouter_api_key: encryptSecretIfNeeded(normalizeOptionalSecretInput(data.openrouter_api_key)),
                        gemini_api_key: encryptSecretIfNeeded(normalizeOptionalSecretInput(data.gemini_api_key)),
                        openai_api_key: encryptSecretIfNeeded(normalizeOptionalSecretInput(data.openai_api_key)),
                    })
                    .eq('workspace_id', workspaceId)
            } catch (migrationError) {
                console.warn('[WORKSPACE_SETTINGS] Secret lazy-migration failed:', migrationError)
            }
        }

        return NextResponse.json(sanitizeWorkspaceSettingsForClient(data));
    } catch (error) {
        if (error instanceof Error && error.message === 'Invalid workspaceId') {
            return NextResponse.json(
                { error: 'Invalid workspaceId parameter' },
                { status: 400 }
            );
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            );
        }
        console.error('[WORKSPACE_SETTINGS] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/workspace/settings
 * Update workspace settings (upsert)
 */
export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        assertJsonBodySize(request, 128 * 1024);
        const { workspaceId, settings } = sanitizeWorkspaceSettingsPayload(await request.json());

        await requireWorkspacePermission(supabase, user.id, workspaceId, 'settings:write');

        const supabaseAdmin = createAdminClient();

        // Check if settings exist
        const { data: existing } = await supabaseAdmin
            .from('workspace_settings')
            .select('id')
            .eq('workspace_id', workspaceId)
            .maybeSingle();

        const sanitizedSettings = buildWorkspaceSettingsUpdatePayload(settings);
        let result;

        if (existing) {
            // Update existing settings
            result = await supabaseAdmin
                .from('workspace_settings')
                .update({
                    ...sanitizedSettings,
                    updated_at: new Date().toISOString()
                })
                .eq('workspace_id', workspaceId)
                .select()
                .single();
        } else {
            // Insert new settings
            result = await supabaseAdmin
                .from('workspace_settings')
                .insert({
                    workspace_id: workspaceId,
                    ...sanitizedSettings
                })
                .select()
                .single();
        }

        if (result.error) {
            console.error('[WORKSPACE_SETTINGS] Error saving:', result.error);
            return NextResponse.json(
                { error: 'Failed to save settings' },
                { status: 500 }
            );
        }

        return NextResponse.json(sanitizeWorkspaceSettingsForClient(result.data));
    } catch (error) {
        if (error instanceof Error && /Invalid workspace settings payload|Invalid workspaceId|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json(
                { error: error.message },
                { status: 400 }
            );
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            );
        }
        console.error('[WORKSPACE_SETTINGS] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
