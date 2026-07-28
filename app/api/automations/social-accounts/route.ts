import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

type SupportedPlatform = 'instagram' | 'facebook';

// GET - List connected social accounts for automations (canvas-friendly, platform-aware)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const activeWorkspace = await getActiveWorkspace();
    if (!activeWorkspace) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const platformParam = searchParams.get('platform');
    const platform =
      platformParam === 'instagram' || platformParam === 'facebook'
        ? (platformParam as SupportedPlatform)
        : null;

    let query = supabase
      .from('social_accounts')
      .select('id, platform, account_name, account_id')
      .eq('workspace_id', activeWorkspace.id)
      .in('platform', ['instagram', 'facebook'])
      .order('platform', { ascending: true })
      .order('account_name', { ascending: true });

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data: accounts, error } = await query;
    if (error) throw error;

    return NextResponse.json({ accounts: accounts || [] });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch social accounts';
    console.error('Get automation social accounts API error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

