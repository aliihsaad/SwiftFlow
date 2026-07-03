import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getExplicitActiveWorkspace } from '@/lib/workspace-utils'
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions'
import { recordStorageObject } from '@/lib/storage/objects'

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_FILE_BYTES = 10 * 1024 * 1024

function sanitizeFileExtension(fileName: string) {
    const rawExtension = fileName.split('.').pop()?.toLowerCase() || 'bin'
    return rawExtension.replace(/[^a-z0-9]/g, '').slice(0, 10) || 'bin'
}

function sanitizeAssetKind(value: FormDataEntryValue | null) {
    return value === 'logo' ? 'logo' : 'reference'
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const activeWorkspace = await getExplicitActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace' }, { status: 404 })
        }

        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'settings:write')

        const formData = await request.formData()
        const kind = sanitizeAssetKind(formData.get('kind'))
        const fileEntry = formData.get('file')

        if (!(fileEntry instanceof File)) {
            return NextResponse.json({ error: 'Image file is required' }, { status: 400 })
        }

        if (!ALLOWED_IMAGE_TYPES.has(fileEntry.type)) {
            return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 })
        }

        if (fileEntry.size <= 0 || fileEntry.size > MAX_FILE_BYTES) {
            return NextResponse.json({ error: 'Image must be smaller than 10 MB' }, { status: 400 })
        }

        const extension = sanitizeFileExtension(fileEntry.name)
        const path = `${activeWorkspace.id}/${kind}/${Date.now()}-${crypto.randomUUID()}.${extension}`

        const supabaseAdmin = createAdminClient()
        const { error: uploadError } = await supabaseAdmin.storage
            .from('brand_assets')
            .upload(path, fileEntry, {
                contentType: fileEntry.type,
                cacheControl: '3600',
                upsert: false,
            })

        if (uploadError) {
            console.error('Brand asset upload error:', uploadError)
            return NextResponse.json({ error: 'Failed to upload brand asset' }, { status: 500 })
        }

        const { data } = supabaseAdmin.storage.from('brand_assets').getPublicUrl(path)

        await recordStorageObject(supabaseAdmin, {
            workspaceId: activeWorkspace.id,
            bucket: 'brand_assets',
            objectPath: path,
            contentType: fileEntry.type,
            sizeBytes: fileEntry.size,
            publicUrl: data.publicUrl,
            sourceTable: 'workspace_brand_profiles',
        })

        return NextResponse.json({
            url: data.publicUrl,
            path,
            kind,
        })
    } catch (error: unknown) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json({ error: error instanceof Error ? error.message : 'Forbidden' }, { status: permissionStatus })
        }

        console.error('Brand asset route error:', error)
        return NextResponse.json({ error: 'Failed to upload brand asset' }, { status: 500 })
    }
}
