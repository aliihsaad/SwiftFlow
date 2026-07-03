import type { SupabaseClient } from "@supabase/supabase-js"
import { redactSensitiveLogValue } from "@/lib/security/redaction"

/**
 * Workspace storage object tracking. Every server-side upload records a row in
 * workspace_storage_objects so retention cleanup can address, quota-count, and
 * delete storage per workspace. Recording is best-effort: a tracking failure
 * must never fail the upload that already succeeded.
 */

export type StorageObjectRecord = {
    workspaceId: string
    bucket: string
    objectPath: string
    contentType?: string | null
    sizeBytes?: number | null
    publicUrl?: string | null
    sourceTable?: string | null
    sourceId?: string | null
}

export async function recordStorageObject(admin: SupabaseClient, record: StorageObjectRecord): Promise<void> {
    try {
        const { error } = await admin
            .from("workspace_storage_objects")
            .upsert(
                {
                    workspace_id: record.workspaceId,
                    bucket: record.bucket,
                    object_path: record.objectPath,
                    content_type: record.contentType ?? null,
                    size_bytes: record.sizeBytes ?? null,
                    public_url: record.publicUrl ?? null,
                    source_table: record.sourceTable ?? null,
                    source_id: record.sourceId ?? null,
                    status: "active",
                },
                { onConflict: "bucket,object_path" },
            )

        if (error) {
            console.error("[storage] failed to record storage object", redactSensitiveLogValue(error))
        }
    } catch (error) {
        console.error("[storage] failed to record storage object", redactSensitiveLogValue(error))
    }
}
