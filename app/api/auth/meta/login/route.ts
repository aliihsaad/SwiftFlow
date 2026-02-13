import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMetaOAuthUrlWithCredentials, getMetaRedirectUri } from '@/utils/meta-oauth';

// Initialize Supabase Admin Client
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Meta OAuth Login Route
 * /api/auth/meta/login
 *
 * Fetches workspace-specific Meta app credentials and redirects to Facebook OAuth.
 * Each workspace can have their own Meta app, bypassing app review.
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
        return NextResponse.json(
            { error: 'Missing workspaceId parameter' },
            { status: 400 }
        );
    }

    // Fetch workspace settings to get Meta app credentials
    const { data: settings, error } = await supabaseAdmin
        .from('workspace_settings')
        .select('meta_app_id, meta_app_secret')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

    if (error) {
        console.error('[META_LOGIN] Error fetching workspace settings:', error);
        return NextResponse.redirect(
            new URL(`/dashboard/settings/brand?error=settings_fetch_failed`, request.url)
        );
    }

    // Check if Meta app credentials are configured
    if (!settings?.meta_app_id || !settings?.meta_app_secret) {
        console.log('[META_LOGIN] No Meta app credentials configured for workspace:', workspaceId);
        return NextResponse.redirect(
            new URL(`/dashboard/settings/brand?error=meta_app_not_configured&tab=social`, request.url)
        );
    }

    console.log('[META_LOGIN] Using workspace Meta app:', {
        workspaceId,
        appId: settings.meta_app_id.substring(0, 8) + '...',
        redirectUri: getMetaRedirectUri()
    });

    // Generate OAuth URL with workspace-specific credentials
    const authUrl = getMetaOAuthUrlWithCredentials(settings.meta_app_id, workspaceId);

    return NextResponse.redirect(authUrl);
}
