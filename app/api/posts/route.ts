import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { PostData } from '@/types/post'
import { getActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { assertJsonBodySize, sanitizePostPayload, assertUuid } from '@/lib/security/phase1-validation'

/**
 * Trigger the process-scheduled-posts edge function (fire-and-forget).
 * The edge function runs on Supabase infrastructure — we don't wait for it.
 */
type EdgeInvokeResult = {
    data: unknown
    error: { message?: string } | null
}

function triggerPublishEdgeFunction() {
    const supabaseAdmin = createAdminClient()
    supabaseAdmin.functions.invoke('process-scheduled-posts').then(
        ({ data, error }: EdgeInvokeResult) => {
            if (error) console.error('[POSTS_API] Edge function error:', error)
            else console.log('[POSTS_API] Edge function result:', data)
        }
    ).catch((e: unknown) => {
        console.error('[POSTS_API] Edge function invoke failed:', e)
    })
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        assertJsonBodySize(request, 256 * 1024)

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get user's active workspace
        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write')

        const { platforms, captionByPlatform, mediaUrls, status, scheduledAt } = sanitizePostPayload(await request.json() as PostData)

        // Validation
        if (!platforms || platforms.length === 0) {
            return NextResponse.json({ error: 'At least one platform is required' }, { status: 400 })
        }

        if (status === 'scheduled' && !scheduledAt) {
            return NextResponse.json({ error: 'Scheduled time is required for scheduled posts' }, { status: 400 })
        }

        const mainCaption = captionByPlatform?.instagram || captionByPlatform?.facebook || ''
        const shouldPublishNow = status === 'published'

        // For "Post Now": save as 'scheduled' with scheduled_for = now
        // so the edge function picks it up immediately
        const { data: post, error } = await supabase
            .from('posts')
            .insert({
                workspace_id: activeWorkspace.id,
                content: mainCaption,
                media_urls: mediaUrls || [],
                platforms: platforms,
                status: shouldPublishNow ? 'scheduled' : status,
                scheduled_for: shouldPublishNow ? new Date().toISOString() : (scheduledAt || new Date().toISOString()),
                published_at: null,
                last_publish_error_code: null,
                last_publish_error_message: null,
                last_publish_attempted_at: null,
                last_publish_results: [],
            })
            .select()
            .single()

        if (error) {
            console.error('Database Error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // If "Post Now", fire off the edge function (don't wait for it)
        if (shouldPublishNow) {
            console.log('[POSTS_API] Post Now - triggering edge function for post:', post.id)
            triggerPublishEdgeFunction()
        }

        return NextResponse.json({ ...post, publishTriggered: shouldPublishNow })

    } catch (error) {
        if (error instanceof Error && /Invalid post payload|At least one valid platform is required|Invalid post status|Invalid scheduled date|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            )
        }
        console.error('Post Creation Error:', error)
        return NextResponse.json(
            { error: 'Failed to create post' },
            { status: 500 }
        )
    }
}

export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient()
        assertJsonBodySize(request, 256 * 1024)

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write')

        const { id, platforms, captionByPlatform, mediaUrls, status, scheduledAt } = sanitizePostPayload(await request.json())

        const mainCaption = captionByPlatform?.instagram || captionByPlatform?.facebook || ''
        const shouldPublishNow = status === 'published'

        // For "Post Now": save as 'scheduled' with scheduled_for = now
        const { data: post, error } = await supabase
            .from('posts')
            .update({
                content: mainCaption,
                media_urls: mediaUrls || [],
                platforms: platforms,
                status: shouldPublishNow ? 'scheduled' : status,
                scheduled_for: shouldPublishNow ? new Date().toISOString() : (status === 'scheduled' ? scheduledAt : null),
                published_at: null,
                last_publish_error_code: null,
                last_publish_error_message: null,
                last_publish_attempted_at: null,
                last_publish_results: [],
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('workspace_id', activeWorkspace.id)
            .select()
            .single()

        if (error) {
            console.error('Database Error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // If "Post Now", fire off the edge function (don't wait for it)
        if (shouldPublishNow) {
            console.log('[POSTS_API] PUT Post Now - triggering edge function for post:', post.id)
            triggerPublishEdgeFunction()
        }

        return NextResponse.json({ ...post, publishTriggered: shouldPublishNow })

    } catch (error) {
        if (error instanceof Error && /Invalid post payload|At least one valid platform is required|Invalid post status|Invalid scheduled date|Invalid post id|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            )
        }
        console.error('Post Update Error:', error)
        return NextResponse.json({ error: 'Failed to update post' }, { status: 500 })
    }
}

// PATCH - Partial update (e.g., just the scheduled date for drag-and-drop)
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient()
        assertJsonBodySize(request, 64 * 1024)

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const id = assertUuid(body?.id, 'post id')
        const scheduledAt = typeof body?.scheduledAt === 'string' ? body.scheduledAt : ''

        if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) {
            return NextResponse.json({ error: 'Scheduled date is required' }, { status: 400 })
        }

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
        }

        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write')

        // Only update the scheduled_for field - preserves all other data
        const { data: post, error } = await supabase
            .from('posts')
            .update({
                scheduled_for: scheduledAt,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('workspace_id', activeWorkspace.id)
            .select()
            .single()

        if (error) {
            console.error('Database Error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(post)

    } catch (error) {
        if (error instanceof Error && /Invalid post id|Scheduled date is required|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            )
        }
        console.error('Post Patch Error:', error)
        return NextResponse.json({ error: 'Failed to update post schedule' }, { status: 500 })
    }
}
