import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
        return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: accounts, error } = await supabase
        .from('social_accounts')
        .select('platform, account_name, metadata')
        .eq('workspace_id', workspaceId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const status = {
        facebook: accounts?.some(a => a.platform === 'facebook') || false,
        instagram: accounts?.some((a: any) => a.platform === 'instagram' || (a.platform === 'facebook' && a.metadata?.instagram_business_account_id)) || false,
        accounts: accounts || []
    };

    return NextResponse.json(status);
}
