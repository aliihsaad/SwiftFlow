import { NextRequest, NextResponse } from 'next/server'
import type { CreatePublishingAutomationPayload } from '@/types/publishing-automation'
import { sanitizeCreatePublishingAutomationPayload } from '@/lib/publishing-automation-validation'
import { getActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { assertJsonBodySize, assertUuid } from '@/lib/security/phase1-validation'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }
type JsonRecord = Record<string, unknown>

interface RecentPostSummary {
    content: string | null
    platforms: unknown
    status: string | null
    created_at: string | null
    published_at: string | null
}

interface BrandProfileSummary {
    business_name?: string | null
    industry?: string | null
    business_description?: string | null
    target_audience?: string | null
    brand_voice?: string | null
    unique_selling_points?: string[] | null
    content_themes?: string[] | null
    brand_colors?: {
        enabled?: boolean
        primary?: string
        secondary?: string
        accent?: string
    } | null
}

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected error'
}

function rowToPayload(row: JsonRecord): CreatePublishingAutomationPayload {
    return sanitizeCreatePublishingAutomationPayload({
        name: row.name,
        platforms: row.platforms,
        approval_mode: row.approval_mode,
        content_goal: row.content_goal,
        brand_voice: row.brand_voice,
        content_pillars: row.content_pillars,
        excluded_terms: row.excluded_terms,
        cta_config: row.cta_config,
        media_policy: row.media_policy,
        consistency_config: row.consistency_config,
        workflow_config: row.workflow_config,
        schedule_config: row.schedule_config,
        daily_cap: row.daily_cap,
    })
}

function summarizeRecentPosts(posts: RecentPostSummary[]): string {
    if (posts.length === 0) return 'No recent app-owned posts found.'
    return posts
        .map((post, index) => {
            const content = String(post.content || '').replace(/\s+/g, ' ').slice(0, 220)
            const platforms = Array.isArray(post.platforms) ? post.platforms.join(', ') : 'unknown'
            return `${index + 1}. [${post.status || 'unknown'} on ${platforms}] ${content || '(media-only post)'}`
        })
        .join('\n')
}

function summarizeBrandProfile(profile: BrandProfileSummary | null): string {
    if (!profile) return 'No workspace brand profile found. Use the automation settings only.'
    const colors = profile.brand_colors?.enabled
        ? [profile.brand_colors.primary, profile.brand_colors.secondary, profile.brand_colors.accent].filter(Boolean).join(', ')
        : ''

    return [
        profile.business_name ? `Business: ${profile.business_name}` : '',
        profile.industry ? `Industry: ${profile.industry}` : '',
        profile.business_description ? `Description: ${profile.business_description}` : '',
        profile.target_audience ? `Target audience: ${profile.target_audience}` : '',
        profile.brand_voice ? `Brand voice: ${profile.brand_voice}` : '',
        profile.unique_selling_points?.length ? `Unique selling points: ${profile.unique_selling_points.join(', ')}` : '',
        profile.content_themes?.length ? `Content themes: ${profile.content_themes.join(', ')}` : '',
        colors ? `Brand colors: ${colors}` : '',
    ].filter(Boolean).join('\n') || 'Workspace brand profile is mostly empty.'
}

function buildIdeaPrompt(automation: CreatePublishingAutomationPayload, recentPosts: RecentPostSummary[], brandProfile: BrandProfileSummary | null): string {
    const consistency = automation.consistency_config
    return `Create one social media post idea for this automation.

Workspace brand profile:
${summarizeBrandProfile(brandProfile)}

Goal: ${automation.content_goal}
Platforms: ${automation.platforms.join(', ')}
Content pillars: ${(automation.content_pillars || []).join(', ') || 'Use workspace brand profile.'}
Excluded terms/claims: ${(automation.excluded_terms || []).join(', ') || 'None provided.'}
Brand voice override: ${automation.brand_voice || consistency?.brand_voice_override || 'Use workspace brand profile.'}
Visual style: ${consistency?.visual_style_prompt || 'Use workspace brand profile and keep visuals consistent.'}
Typography notes: ${consistency?.typography_notes || 'None provided.'}

Recent app-owned posts to avoid repeating:
${summarizeRecentPosts(recentPosts)}

Return one strong idea with a usable caption draft. Avoid repeating recent hooks, topics, and caption structure.`
}

function buildCaptionDescription(automation: CreatePublishingAutomationPayload, ideaTitle: string, ideaBody: string, recentPosts: RecentPostSummary[], brandProfile: BrandProfileSummary | null): string {
    const consistency = automation.consistency_config
    return `Workspace brand profile:
${summarizeBrandProfile(brandProfile)}

Automation goal: ${automation.content_goal}
Idea title: ${ideaTitle}
Idea draft: ${ideaBody}
Platforms: ${automation.platforms.join(', ')}
Brand voice: ${automation.brand_voice || consistency?.brand_voice_override || 'Use workspace brand profile.'}
CTA: ${automation.cta_config?.enabled ? `${automation.cta_config.text || 'Use a clear CTA'} ${automation.cta_config.url || ''}` : 'No forced CTA.'}
Avoid these terms: ${(automation.excluded_terms || []).join(', ') || 'None.'}
Recent posts to avoid duplicating:
${summarizeRecentPosts(recentPosts)}

Write one ready-to-review caption that is consistent with the brand voice and does not repeat recent posts.`
}

function buildImagePrompt(automation: CreatePublishingAutomationPayload, caption: string, brandProfile: BrandProfileSummary | null): string {
    const consistency = automation.consistency_config
    return `Create a social media image for this caption:
${caption}

Workspace brand profile:
${summarizeBrandProfile(brandProfile)}

Visual consistency rules:
${consistency?.visual_style_prompt || 'Use a clean branded style aligned with the workspace brand profile.'}
Colors: ${(consistency?.color_palette || []).join(', ') || 'Use workspace brand colors when available.'}
Typography/layout notes: ${consistency?.typography_notes || 'Readable, platform-friendly composition.'}
Avoid visual repetition while keeping the same brand identity.`
}

async function invokeEdgeFunction(functionName: string, body: JsonRecord): Promise<JsonRecord> {
    const admin = createAdminClient()
    const { data, error } = await admin.functions.invoke(functionName, { body })
    if (error) throw new Error(error.message || `${functionName} failed`)
    if (!isRecord(data)) throw new Error(`${functionName} returned an invalid response`)
    if (typeof data.error === 'string' && data.error) throw new Error(data.error)
    return data
}

function extractIdea(response: JsonRecord, fallback: string): { title: string; body: string } {
    const result = isRecord(response.result) ? response.result : {}
    const rows = Array.isArray(result.data) ? result.data : []
    const first = rows.find(isRecord)
    if (first) {
        return {
            title: typeof first.title === 'string' ? first.title : fallback,
            body: typeof first.body === 'string' ? first.body : fallback,
        }
    }
    if (typeof result.message === 'string') return { title: fallback, body: result.message }
    return { title: fallback, body: fallback }
}

function extractCaption(response: JsonRecord, fallback: string): string {
    const suggestions = Array.isArray(response.suggestions) ? response.suggestions : []
    const first = suggestions.find((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    return first?.trim() || fallback
}

function extractImageUrl(response: JsonRecord): string | null {
    const result = isRecord(response.result) ? response.result : {}
    return typeof result.imageUrl === 'string' && result.imageUrl ? result.imageUrl : null
}

export async function POST(
    request: NextRequest,
    { params }: RouteContext,
) {
    let runId: string | null = null

    try {
        const { id } = await params
        const automationId = assertUuid(id, 'automation id')
        assertJsonBodySize(request, 64 * 1024)

        const supabase = await createClient()
        const admin = createAdminClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'automation:write')
        await request.json().catch(() => ({}))

        const { data: automationRow, error: automationError } = await supabase
            .from('publishing_automations')
            .select('*')
            .eq('id', automationId)
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        if (automationError) throw automationError
        if (!automationRow) return NextResponse.json({ error: 'Publishing automation not found' }, { status: 404 })

        const automation = rowToPayload(automationRow as JsonRecord)
        const recentLimit = automation.consistency_config?.recent_posts_limit || 12
        const { data: recentRows, error: recentError } = await supabase
            .from('posts')
            .select('content, platforms, status, created_at, published_at')
            .eq('workspace_id', activeWorkspace.id)
            .order('created_at', { ascending: false })
            .limit(recentLimit)

        if (recentError) throw recentError
        const recentPosts = (recentRows || []) as RecentPostSummary[]

        const { data: brandProfileRow, error: brandProfileError } = await supabase
            .from('workspace_brand_profiles')
            .select('business_name, industry, business_description, target_audience, brand_voice, unique_selling_points, content_themes, brand_colors')
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        if (brandProfileError) throw brandProfileError
        const brandProfile = (brandProfileRow || null) as BrandProfileSummary | null
        const promptSnapshot = {
            automation_id: automationId,
            workflow_config: automation.workflow_config,
            consistency_config: automation.consistency_config,
            platforms: automation.platforms,
            brand_profile: brandProfile,
            recent_posts: recentPosts,
        }

        const { data: run, error: runError } = await admin
            .from('publishing_automation_runs')
            .insert({
                workspace_id: activeWorkspace.id,
                publishing_automation_id: automationId,
                status: 'running',
                approval_mode: 'manual_review',
                prompt_snapshot: promptSnapshot,
            })
            .select('id')
            .single()

        if (runError) throw runError
        runId = typeof run?.id === 'string' ? run.id : null
        if (!runId) throw new Error('Failed to create publishing automation run')

        try {
            const ideaPrompt = buildIdeaPrompt(automation, recentPosts, brandProfile)
            const ideaResponse = await invokeEdgeFunction('generate-ideas', {
                workspaceId: activeWorkspace.id,
                messages: [{ role: 'user', content: ideaPrompt }],
            })
            const idea = extractIdea(ideaResponse, automation.content_goal)

            const captionResponse = await invokeEdgeFunction('generate-caption', {
                workspaceId: activeWorkspace.id,
                description: buildCaptionDescription(automation, idea.title, idea.body, recentPosts, brandProfile),
                platforms: automation.platforms,
                tone: 'professional',
            })
            const caption = extractCaption(captionResponse, idea.body)
            const mediaUrls: string[] = []

            if (automation.workflow_config.media_mode === 'generated_image') {
                const imageResponse = await invokeEdgeFunction('generate-image', {
                    workspaceId: activeWorkspace.id,
                    messages: [{ role: 'user', content: buildImagePrompt(automation, caption, brandProfile) }],
                })
                const imageUrl = extractImageUrl(imageResponse)
                if (imageUrl) mediaUrls.push(imageUrl)
            }

            if (automation.workflow_config.media_mode === 'carousel') {
                await invokeEdgeFunction('generate-carousel', {
                    workspaceId: activeWorkspace.id,
                    messages: [{ role: 'user', content: `${idea.title}\n\n${caption}` }],
                })
            }

            const { data: post, error: postError } = await admin
                .from('posts')
                .insert({
                    workspace_id: activeWorkspace.id,
                    content: caption,
                    media_urls: mediaUrls,
                    platforms: automation.platforms,
                    status: 'draft',
                    scheduled_for: null,
                    published_at: null,
                    last_publish_error_code: null,
                    last_publish_error_message: null,
                    last_publish_attempted_at: null,
                    last_publish_results: [],
                    source_publishing_automation_id: automationId,
                    source_publishing_automation_run_id: runId,
                })
                .select()
                .single()

            if (postError) throw postError

            const resultSnapshot = {
                idea,
                caption,
                media_urls: mediaUrls,
                post_id: isRecord(post) && typeof post.id === 'string' ? post.id : null,
            }

            await admin
                .from('publishing_automation_runs')
                .update({
                    status: 'completed',
                    generated_post_id: resultSnapshot.post_id,
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

            return NextResponse.json({ success: true, post, run: { id: runId, status: 'completed' } })
        } catch (generationError: unknown) {
            const message = errorMessage(generationError)
            await admin
                .from('publishing_automation_runs')
                .update({
                    status: 'failed',
                    error_message: message,
                    finished_at: new Date().toISOString(),
                })
                .eq('id', runId)

            await admin
                .from('publishing_automations')
                .update({
                    last_error: message,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', automationId)

            throw generationError
        }
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid automation id|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) return NextResponse.json({ error: errorMessage(error) }, { status: permissionStatus })
        console.error('Run publishing automation API error:', error, { runId })
        return NextResponse.json({ error: errorMessage(error) || 'Failed to run publishing automation' }, { status: 500 })
    }
}
