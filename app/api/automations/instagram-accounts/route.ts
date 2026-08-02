import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

// GET - List Instagram accounts for the workspace
export async function GET() {
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

        // Get Instagram accounts
        const { data: accounts, error } = await supabase
            .from('social_accounts')
            .select('id, platform, account_name, account_id')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', 'instagram')
            .order('account_name', { ascending: true });

        if (error) {
            throw error;
        }

        return NextResponse.json({
            accounts: accounts || []
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch accounts';
        console.error('Get Instagram accounts API error:', error);
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
