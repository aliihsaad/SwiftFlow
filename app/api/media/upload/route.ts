import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getExplicitActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { gateWorkspaceLimit } from '@/lib/billing/gate'
import { getWorkspaceUsage, incrementWorkspaceUsage } from '@/lib/billing/usage'
import { recordStorageObject } from '@/lib/storage/objects'

export const runtime = 'nodejs'

/**
 * Workspace media upload endpoint. Replaces direct browser->storage uploads so
 * every object lands under a workspace-scoped path and is tracked in
 * workspace_storage_objects for quotas and retention cleanup.
 */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 100 * 1024 * 1024

const IMAGE_TYPES: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
}

const VIDEO_TYPES: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/ogg': 'ogv',
}

type UploadKind = 'post' | 'generated'

function resolveUploadKind(value: FormDataEntryValue | null): UploadKind {
    return value === 'generated' ? 'generated' : 'post'
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const workspace = await getExplicitActiveWorkspace()
        if (!workspace) {
            return NextResponse.json({ error: 'No active workspace selected' }, { status: 400 })
        }
        await requireWorkspacePermission(supabase, user.id, workspace.id, 'content:write')

        const formData = await request.formData()
        const kind = resolveUploadKind(formData.get('kind'))
        const fileEntry = formData.get('file')
        if (!(fileEntry instanceof File)) {
            return NextResponse.json({ error: 'A media file is required' }, { status: 400 })
        }

        const contentType = fileEntry.type.toLowerCase()
        const isImage = Boolean(IMAGE_TYPES[contentType])
        const isVideo = kind === 'post' && Boolean(VIDEO_TYPES[contentType])
        if (!isImage && !isVideo) {
            return NextResponse.json({ error: 'Unsupported media type' }, { status: 400 })
        }

        const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
        if (fileEntry.size <= 0 || fileEntry.size > maxBytes) {
            return NextResponse.json(
                { error: `Media must be smaller than ${Math.round(maxBytes / (1024 * 1024))} MB` },
                { status: 400 },
            )
        }

        const admin = createAdminClient()
        const bucket = kind === 'generated' ? 'generated_assets' : 'post_media'
        const quotaLimit = kind === 'generated' ? 'generated_asset_quota_bytes' : 'media_quota_bytes'
        const usageMetric = kind === 'generated' ? 'generated_asset_bytes' : 'media_upload_bytes'

        // Plan quota gate (no-op unless BILLING_ENFORCEMENT_MODE is log/enforce).
        const quotaGate = await gateWorkspaceLimit(
            workspace.id,
            quotaLimit,
            async () => (await getWorkspaceUsage(admin, workspace.id, usageMetric)) + fileEntry.size,
        )
        if (quotaGate) return quotaGate

        const extension = IMAGE_TYPES[contentType] || VIDEO_TYPES[contentType]
        const path = `${workspace.id}/uploads/${Date.now()}-${crypto.randomUUID()}.${extension}`

        const { error: uploadError } = await admin.storage
            .from(bucket)
            .upload(path, fileEntry, {
                contentType,
                cacheControl: '3600',
                upsert: false,
            })

        if (uploadError) {
            console.error('[media/upload] storage upload failed:', uploadError)
            return NextResponse.json({ error: 'Failed to upload media' }, { status: 500 })
        }

        const { data: publicData } = admin.storage.from(bucket).getPublicUrl(path)

        await recordStorageObject(admin, {
            workspaceId: workspace.id,
            bucket,
            objectPath: path,
            contentType,
            sizeBytes: fileEntry.size,
            publicUrl: publicData.publicUrl,
        })
        await incrementWorkspaceUsage(admin, workspace.id, usageMetric, fileEntry.size)

        return NextResponse.json({
            bucket,
            path,
            url: publicData.publicUrl,
            contentType,
            size: fileEntry.size,
        })
    } catch (error: unknown) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus },
            )
        }
        console.error('[media/upload] error:', error)
        return NextResponse.json({ error: 'Failed to upload media' }, { status: 500 })
    }
}
