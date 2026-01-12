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

        const mainCaption = captionByPlatform.instagram || captionByPlatform.facebook || ''

        // Construct database record
        const { data: post, error } = await supabase
            .from('posts')
            .insert({
                workspace_id: activeWorkspace.id,
                content: mainCaption, // Main caption for listing/search
                media_urls: mediaUrls,
                media_type: mediaUrls.length > 0 ? (mediaUrls[0].includes('video') ? 'video' : 'image') : 'text',
                platforms: {
                    selection: platforms,
                    captions: captionByPlatform
                },
                status: status,
                scheduled_for: status === 'scheduled' ? scheduledAt : null,
                posted_at: status === 'published' ? new Date().toISOString() : null,
                ai_generated: false
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
