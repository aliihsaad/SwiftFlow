import { NextResponse } from 'next/server'
import {
    getDefaultImageModelForProvider,
    getModelLabel,
    getTypographySafeImageModels,
    isAIProvider,
    isTypographySafeImageModel,
    type AIProvider,
} from '@/lib/ai-models'
import { getActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected error'
}

export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'workspace:read')

        const admin = createAdminClient()
        const { data: settings, error } = await admin
            .from('workspace_settings')
            .select('ai_provider, ai_image_model_name')
            .eq('workspace_id', activeWorkspace.id)
            .maybeSingle()

        if (error) throw error

        const provider: AIProvider = isAIProvider(String(settings?.ai_provider || ''))
            ? settings?.ai_provider as AIProvider
            : 'openrouter'
        const configuredModel = typeof settings?.ai_image_model_name === 'string' && settings.ai_image_model_name.trim()
            ? settings.ai_image_model_name.trim()
            : null
        const effectiveModel = configuredModel || getDefaultImageModelForProvider(provider)
        const isRecommendedForText = isTypographySafeImageModel(effectiveModel)
        const recommendedModels = getTypographySafeImageModels(provider)

        return NextResponse.json({
            provider,
            configuredModel,
            effectiveModel,
            effectiveModelLabel: getModelLabel(provider, 'image', effectiveModel),
            isRecommendedForText,
            recommendedModels,
            message: isRecommendedForText
                ? 'This image model is recommended for typography-heavy automation.'
                : 'For quote images, switch to a typography-safe image model or keep text in the caption only.',
        })
    } catch (error: unknown) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) return NextResponse.json({ error: errorMessage(error) }, { status: permissionStatus })
        console.error('Publishing automation model recommendation API error:', error)
        return NextResponse.json({ error: errorMessage(error) || 'Failed to fetch model recommendation' }, { status: 500 })
    }
}
