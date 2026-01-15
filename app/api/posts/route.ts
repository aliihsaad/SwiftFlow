import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { PostData } from '@/types/post'
import { getActiveWorkspace } from '@/lib/workspace-utils'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()

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

        const body = await request.json() as PostData
        const { platforms, captionByPlatform, mediaUrls, status, scheduledAt } = body

        // Validation
        if (!platforms || platforms.length === 0) {
            return NextResponse.json({ error: 'At least one platform is required' }, { status: 400 })
        }

        if (status === 'scheduled' && !scheduledAt) {
            return NextResponse.json({ error: 'Scheduled time is required for scheduled posts' }, { status: 400 })
        }

        const mainCaption = captionByPlatform?.instagram || captionByPlatform?.facebook || ''

        // Construct database record
        const { data: post, error } = await supabase
            .from('posts')
            .insert({
                workspace_id: activeWorkspace.id,
                content: mainCaption,
                media_urls: mediaUrls || [],
                platforms: platforms,
                status: status,
                scheduled_for: status === 'scheduled' ? scheduledAt : null,
                published_at: status === 'published' ? new Date().toISOString() : null
            })
            .select()
            .single()

        if (error) {
            console.error('Database Error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(post)

    } catch (error) {
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

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { id, platforms, captionByPlatform, mediaUrls, status, scheduledAt } = body

        if (!id) {
            return NextResponse.json({ error: 'Post ID is required' }, { status: 400 })
        }

        const mainCaption = captionByPlatform?.instagram || captionByPlatform?.facebook || ''

        const { data: post, error } = await supabase
            .from('posts')
            .update({
                content: mainCaption,
                media_urls: mediaUrls || [],
                platforms: platforms,
                status: status,
                scheduled_for: status === 'scheduled' ? scheduledAt : null,
                published_at: status === 'published' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single()

        if (error) {
            console.error('Database Error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(post)

    } catch (error) {
        console.error('Post Update Error:', error)
        return NextResponse.json({ error: 'Failed to update post' }, { status: 500 })
    }
}

// PATCH - Partial update (e.g., just the scheduled date for drag-and-drop)
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { id, scheduledAt } = body

        if (!id) {
            return NextResponse.json({ error: 'Post ID is required' }, { status: 400 })
        }

        if (!scheduledAt) {
            return NextResponse.json({ error: 'Scheduled date is required' }, { status: 400 })
        }

        // Only update the scheduled_for field - preserves all other data
        const { data: post, error } = await supabase
            .from('posts')
            .update({
                scheduled_for: scheduledAt,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single()

        if (error) {
            console.error('Database Error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(post)

    } catch (error) {
        console.error('Post Patch Error:', error)
        return NextResponse.json({ error: 'Failed to update post schedule' }, { status: 500 })
    }
}
