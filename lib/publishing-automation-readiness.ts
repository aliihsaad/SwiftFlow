import { canPublishWithMetaAccount, type MetaAccountMetadata, type MetaPlatform } from '@/lib/meta-account'
import type { Platform } from '@/types/post'
import { createClient } from '@/utils/supabase/server'

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>

interface SocialAccountForReadiness {
    id: string
    platform: string | null
    metadata: MetaAccountMetadata | null
}

export interface PublishingAutomationReadiness {
    ready: boolean
    missingPlatforms: Platform[]
    missingPermissions: string[]
}

function requiredPermission(platform: Platform): string {
    return platform === 'facebook' ? 'pages_manage_posts' : 'instagram_content_publish'
}

export async function checkPublishingAutomationReadiness(
    supabase: ServerSupabaseClient,
    workspaceId: string,
    platforms: Platform[],
): Promise<PublishingAutomationReadiness> {
    const { data, error } = await supabase
        .from('social_accounts')
        .select('id, platform, metadata')
        .eq('workspace_id', workspaceId)
        .in('platform', platforms)

    if (error) {
        throw new Error(`Failed to verify publishing readiness: ${error.message}`)
    }

    const accounts = (data || []) as SocialAccountForReadiness[]
    const missingPlatforms = platforms.filter((platform) => {
        return !accounts.some((account) => {
            if (account.platform !== platform) return false
            return canPublishWithMetaAccount(account.metadata, platform as MetaPlatform)
        })
    })

    return {
        ready: missingPlatforms.length === 0,
        missingPlatforms,
        missingPermissions: Array.from(new Set(missingPlatforms.map(requiredPermission))),
    }
}
