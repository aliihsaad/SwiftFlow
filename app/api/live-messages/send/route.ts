import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

// POST - Send a message reply via Meta API
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }

        const body = await request.json();
        const { recipientId, message, platform } = body;

        if (!recipientId || !message || !platform) {
            return NextResponse.json(
                { error: 'recipientId, message, and platform are required' },
                { status: 400 }
            );
        }

        // Get the social account
        const { data: account, error: accountError } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', platform)
            .single();

        if (accountError || !account?.access_token) {
            return NextResponse.json(
                { error: 'No account or token available' },
                { status: 400 }
            );
        }

        // For Instagram, use the Page ID for sending messages
        const pageId = platform === 'instagram'
            ? (account.metadata?.connected_page_id || account.account_id)
            : account.account_id;

        const sendUrl = `${META_GRAPH_URL}/${pageId}/messages`;

        const response = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text: message },
                access_token: account.access_token,
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to send message');
        }

        return NextResponse.json({
            success: true,
            messageId: result.message_id,
        });

    } catch (error: any) {
        console.error('Send message API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to send message' },
            { status: 500 }
        );
    }
}
