import { NextRequest, NextResponse } from 'next/server'
import { assertUuid } from '@/lib/security/phase1-validation'
import { getActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import {
    buildAutomationImagePrompt,
    errorMessage,
    extractImageUrl,
    getImageModelRecommendation,
    invokeEdgeFunction,
    rowToPublishingAutomationPayload,
    type BrandProfileSummary,
} from '@/lib/publishing-automation-image-generation'
import {
    buildMediaResultSnapshot,
    getCaptionFromResultSnapshot,
    getExistingMediaUrls,
    shouldGenerateAutomationImage,
} from '@/lib/publishing-automation-run-media'

export const maxDuration = 60

type RouteContext = { params: Promise<{ id: string; runId: string }> }
type JsonRecord = Record<string, unknown>

export async function POST(
    _request: NextRequest,
    { params }: RouteContext,
) {
    let runId: string | null = null

    try {
        const { id, runId: rawRunId } = await params
        const automationId = assertUuid(id, 'automation id')
        runId = assertUuid(rawRunId, 'automation run id')

        const supabase = await createClient()
        const admin = createAdminClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'automation:write')

        const { data: automationRow, error: automationError } = await supabase
            .from('publishing_automations')
            .select('*')
            .eq('id', automationId)
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        if (automationError) throw automationError
        if (!automationRow) return NextResponse.json({ error: 'Publishing automation not found' }, { status: 404 })

        const { data: runRow, error: runError } = await admin
            .from('publishing_automation_runs')
            .select('id, workspace_id, publishing_automation_id, generated_post_id, result_snapshot, status')
            .eq('id', runId)
            .eq('workspace_id', activeWorkspace.id)
            .eq('publishing_automation_id', automationId)
            .maybeSingle()

        if (runError) throw runError
        if (!runRow) return NextResponse.json({ error: 'Publishing automation run not found' }, { status: 404 })

        const generatedPostId = typeof runRow.generated_post_id === 'string' ? runRow.generated_post_id : null
        if (!generatedPostId) {
            throw new Error('Automation run does not have a generated draft post yet.')
        }

        const { data: postRow, error: postError } = await admin
            .from('posts')
            .select('id, content, media_urls')
            .eq('id', generatedPostId)
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        if (postError) throw postError
        if (!postRow) return NextResponse.json({ error: 'Generated draft post not found' }, { status: 404 })

        const automation = rowToPublishingAutomationPayload(automationRow as JsonRecord)
        const existingMediaUrls = getExistingMediaUrls(postRow.media_urls)
        const currentSnapshot = runRow.result_snapshot

        if (!shouldGenerateAutomationImage({
            workflow_config: automation.workflow_config,
            post_media_urls: existingMediaUrls,
        })) {
            const resultSnapshot = buildMediaResultSnapshot(currentSnapshot, existingMediaUrls, generatedPostId)
            await admin
                .from('publishing_automation_runs')
                .update({
                    status: 'completed',
                    result_snapshot: resultSnapshot,
                    finished_at: new Date().toISOString(),
                })
                .eq('id', runId)

            return NextResponse.json({
                success: true,
                media_urls: existingMediaUrls,
                skipped: existingMediaUrls.length > 0 ? 'media_already_attached' : 'image_not_required',
            })
        }

        const { data: brandProfileRow, error: brandProfileError } = await supabase
            .from('workspace_brand_profiles')
            .select('business_name, industry, business_description, target_audience, brand_voice, unique_selling_points, content_themes, brand_colors')
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        if (brandProfileError) throw brandProfileError
        const brandProfile = (brandProfileRow || null) as BrandProfileSummary | null

        const { data: workspaceSettingsRow, error: workspaceSettingsError } = await admin
            .from('workspace_settings')
            .select('ai_provider, ai_image_model_name')
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        if (workspaceSettingsError) throw workspaceSettingsError

        const captionFallback = typeof postRow.content === 'string' ? postRow.content : ''
        const caption = getCaptionFromResultSnapshot(currentSnapshot, captionFallback)
        if (!caption) throw new Error('Generated draft has no caption to build an image from.')

        const imageModelRecommendation = getImageModelRecommendation((workspaceSettingsRow || null) as JsonRecord | null)
        const imageResponse = await invokeEdgeFunction('generate-image', {
            workspaceId: activeWorkspace.id,
            attachToPostId: generatedPostId,
            automationRunId: runId,
            automationId,
            messages: [{
                role: 'user',
                content: buildAutomationImagePrompt(automation, caption, brandProfile, imageModelRecommendation),
            }],
        })
        const imageUrl = extractImageUrl(imageResponse)
        if (!imageUrl) throw new Error('Image generation completed without returning an image URL.')

        const mediaUrls = [imageUrl]
        const { error: mediaUpdateError } = await admin
            .from('posts')
            .update({
                media_urls: mediaUrls,
                updated_at: new Date().toISOString(),
            })
            .eq('id', generatedPostId)
            .eq('workspace_id', activeWorkspace.id)

        if (mediaUpdateError) throw mediaUpdateError

        const resultSnapshot = buildMediaResultSnapshot(currentSnapshot, mediaUrls, generatedPostId)
        await admin
            .from('publishing_automation_runs')
            .update({
                status: 'completed',
                result_snapshot: resultSnapshot,
                finished_at: new Date().toISOString(),
            })
            .eq('id', runId)

        await admin
            .from('publishing_automations')
            .update({
                last_run_at: new Date().toISOString(),
                last_error: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', automationId)

        return NextResponse.json({
            success: true,
            media_urls: mediaUrls,
        })
    } catch (error: unknown) {
        const admin = createAdminClient()
        const message = errorMessage(error)

        if (runId) {
            await admin
                .from('publishing_automation_runs')
                .update({
                    status: 'failed',
                    error_message: message,
                    finished_at: new Date().toISOString(),
                })
                .eq('id', runId)
        }

        if (error instanceof Error && /Invalid automation id|Invalid automation run id/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) return NextResponse.json({ error: message }, { status: permissionStatus })
        console.error('Generate publishing automation image API error:', error, { runId })
        return NextResponse.json({ error: message || 'Failed to generate automation image' }, { status: 500 })
    }
}
