// Backfill legacy storage objects into workspace_storage_objects.
//
// Pre-2026-07-02 client uploads landed in the post_media / generated_assets
// bucket roots (or in workspace folders) without a tracking row, making them
// invisible to retention cleanup and quota accounting. This script:
//   - walks each workspace-prefixed folder (folder name = workspace UUID)
//   - upserts missing tracking rows for those files
//   - REPORTS root-level / unattributable objects; it never deletes anything
//
// Usage:
//   node scripts/backfill-storage-objects.mjs           # dry run (default)
//   node scripts/backfill-storage-objects.mjs --apply   # write tracking rows

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')
const BUCKETS = ['post_media', 'generated_assets']
const LIST_PAGE_SIZE = 1000
const UPSERT_CHUNK_SIZE = 500
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Lists every entry directly under `prefix`, following storage pagination. */
async function listAll(bucket, prefix) {
  const entries = []
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`storage list failed for ${bucket}/${prefix || '(root)'}: ${error.message}`)
    entries.push(...(data || []))
    if (!data || data.length < LIST_PAGE_SIZE) return entries
  }
}

/** Recursively collects file objects under `prefix`. Folders have a null id. */
async function collectFiles(bucket, prefix) {
  const files = []
  const entries = await listAll(bucket, prefix)
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.id === null) {
      files.push(...(await collectFiles(bucket, path)))
    } else {
      files.push({
        path,
        contentType: entry.metadata?.mimetype ?? null,
        sizeBytes: entry.metadata?.size ?? null,
      })
    }
  }
  return files
}

async function loadTrackedPaths(bucket) {
  const tracked = new Set()
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await admin
      .from('workspace_storage_objects')
      .select('object_path')
      .eq('bucket', bucket)
      .range(offset, offset + LIST_PAGE_SIZE - 1)
    if (error) throw new Error(`failed to load tracked paths for ${bucket}: ${error.message}`)
    for (const row of data || []) tracked.add(row.object_path)
    if (!data || data.length < LIST_PAGE_SIZE) return tracked
  }
}

async function loadWorkspaceIds() {
  const ids = new Set()
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await admin
      .from('workspaces')
      .select('id')
      .range(offset, offset + LIST_PAGE_SIZE - 1)
    if (error) throw new Error(`failed to load workspaces: ${error.message}`)
    for (const row of data || []) ids.add(row.id)
    if (!data || data.length < LIST_PAGE_SIZE) return ids
  }
}

async function upsertRows(rows) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE)
    const { error } = await admin
      .from('workspace_storage_objects')
      .upsert(chunk, { onConflict: 'bucket,object_path' })
    if (error) throw new Error(`upsert failed: ${error.message}`)
  }
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing tracking rows)' : 'DRY RUN (no writes)'}\n`)
  const workspaceIds = await loadWorkspaceIds()
  console.log(`Known workspaces: ${workspaceIds.size}`)

  let totalInserted = 0
  const orphanReport = []

  for (const bucket of BUCKETS) {
    console.log(`\n=== Bucket: ${bucket} ===`)
    const tracked = await loadTrackedPaths(bucket)
    console.log(`Already tracked rows: ${tracked.size}`)

    const rootEntries = await listAll(bucket, '')
    const rootFiles = rootEntries.filter((entry) => entry.id !== null)
    const folders = rootEntries.filter((entry) => entry.id === null)

    // Root-level files predate workspace prefixes and cannot be attributed.
    // Report them; deletion is a separate, explicitly human-approved step.
    for (const file of rootFiles) {
      orphanReport.push({ bucket, path: file.name, size: file.metadata?.size ?? null })
    }

    // Attribute each file to the first path segment that is a known workspace
    // UUID. Handles both layouts: <workspaceId>/... and the legacy
    // generated/<workspaceId>/... prefix in generated_assets.
    const rows = []
    let unattributable = 0
    for (const folder of folders) {
      const files = await collectFiles(bucket, folder.name)
      for (const file of files) {
        const segments = file.path.split('/')
        const workspaceId = segments
          .slice(0, 2)
          .find((segment) => UUID_RE.test(segment) && workspaceIds.has(segment))
        if (!workspaceId) {
          unattributable += 1
          orphanReport.push({ bucket, path: `${file.path} (no matching workspace)`, size: file.sizeBytes })
          continue
        }
        if (tracked.has(file.path)) continue
        rows.push({
          workspace_id: workspaceId,
          bucket,
          object_path: file.path,
          content_type: file.contentType,
          size_bytes: file.sizeBytes,
          public_url: admin.storage.from(bucket).getPublicUrl(file.path).data.publicUrl,
          source_table: null,
          source_id: null,
          status: 'active',
        })
      }
    }

    console.log(`Root-level orphan files: ${rootFiles.length}`)
    console.log(`Unattributable nested files: ${unattributable}`)
    console.log(`Untracked workspace files to backfill: ${rows.length}`)

    if (APPLY && rows.length > 0) {
      await upsertRows(rows)
      console.log(`Inserted/updated ${rows.length} tracking rows`)
    } else if (rows.length > 0) {
      for (const row of rows.slice(0, 20)) console.log(`  would insert: ${row.object_path}`)
      if (rows.length > 20) console.log(`  ... and ${rows.length - 20} more`)
    }
    totalInserted += APPLY ? rows.length : 0
  }

  console.log(`\n=== Summary ===`)
  console.log(`Tracking rows written: ${totalInserted}${APPLY ? '' : ' (dry run — nothing written)'}`)
  console.log(`Orphans (reported only, NOT deleted): ${orphanReport.length}`)
  for (const orphan of orphanReport) {
    console.log(`  orphan: ${orphan.bucket}/${orphan.path}${orphan.size != null ? ` (${orphan.size} bytes)` : ''}`)
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error.message)
  process.exit(1)
})
