import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

// GET - List all automations for the workspace
export async function GET(request: NextRequest) {
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

        const { data: automations, error } = await supabase
            .from('automations')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        // Get actual counts from automation_logs for each automation
        const automationsWithStats = await Promise.all(
            (automations || []).map(async (automation) => {
                const { count: totalTriggered } = await supabase
                    .from('automation_logs')
                    .select('*', { count: 'exact', head: true })
                    .eq('automation_id', automation.id);

                const { count: totalDmsSent } = await supabase
                    .from('automation_logs')
                    .select('*', { count: 'exact', head: true })
                    .eq('automation_id', automation.id)
                    .eq('dm_sent', true);

                return {
                    ...automation,
                    total_triggered: totalTriggered || 0,
                    total_dms_sent: totalDmsSent || 0
                };
            })
        );

        return NextResponse.json({
            automations: automationsWithStats
        });

    } catch (error: any) {
        console.error('Get automations API error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return NextResponse.json(
            {
                error: error.message || 'Failed to fetch automations',
                details: error.details || error.hint || error.code || null
            },
            { status: 500 }
        );
    }
}

// POST - Create a new automation
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

        const body = await request.json();
        const {
            social_account_id,
            name,
            platform_post_id,
            post_thumbnail_url,
            post_caption,
            trigger_config,
            comment_reply_config,
            dm_config
        } = body;

        // Validation
        if (!social_account_id || !name || !platform_post_id || !dm_config) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Verify the social account belongs to this workspace
        const { data: account, error: accountError } = await supabase
            .from('social_accounts')
            .select('id, access_token')
            .eq('id', social_account_id)
            .eq('workspace_id', activeWorkspace.id)
            .single();

        if (accountError || !account) {
            return NextResponse.json(
                { error: 'Invalid social account' },
                { status: 400 }
            );
        }

        // Verify the post is accessible (can fetch comments)
        const testUrl = `https://graph.facebook.com/v21.0/${platform_post_id}/comments?fields=id&limit=1&access_token=${account.access_token}`;
        const testResponse = await fetch(testUrl);
        const testResult = await testResponse.json();

        if (!testResponse.ok || testResult.error) {
            console.error('Post accessibility check failed:', testResult.error);
            return NextResponse.json(
                {
                    error: 'This post is not accessible. It may have been posted before your account was connected, or it has been deleted. Please select a more recent post.',
                    details: testResult.error?.message
                },
                { status: 400 }
            );
        }

        // Create the automation
        const { data: automation, error: createError } = await supabase
            .from('automations')
            .insert({
                workspace_id: activeWorkspace.id,
                social_account_id,
                type: 'comment_to_dm',
                name,
                platform_post_id,
                post_thumbnail_url,
                post_caption,
                trigger_config: trigger_config || { trigger_type: 'any_comment', keywords: [] },
                comment_reply_config: comment_reply_config || { enabled: false, messages: [] },
                dm_config,
                is_active: true
            })
            .select()
            .single();

        if (createError) {
            throw createError;
        }

        return NextResponse.json({
            success: true,
            automation
        });

    } catch (error: any) {
        console.error('Create automation API error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return NextResponse.json(
            {
                error: error.message || 'Failed to create automation',
                details: error.details || error.hint || error.code || null
            },
            { status: 500 }
        );
    }
}
