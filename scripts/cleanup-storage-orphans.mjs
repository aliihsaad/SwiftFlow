// Delete legacy storage orphans reported by backfill-storage-objects.mjs:
//   1. Root-level files in post_media / generated_assets — EXCEPT files still
//      referenced by posts.media_urls / published_posts (kept and reported).
//   2. generated_assets/generated/<uuid>/ trees whose uuid matches no
//      existing workspace (deleted workspaces; nothing can reference them).
//
// Usage:
//   node scripts/cleanup-storage-orphans.mjs           # dry run (default)
//   node scripts/cleanup-storage-orphans.mjs --apply   # actually delete

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')
const BUCKETS = ['post_media', 'generated_assets']
const PAGE = 1000
const REMOVE_BATCH = 100
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function listAll(bucket, prefix) {
  const entries = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE, offset })
    if (error) throw new Error(`list ${bucket}/${prefix || '(root)'}: ${error.message}`)
    entries.push(...(data || []))
    if (!data || data.length < PAGE) return entries
  }
}

/** Collect every storage filename referenced anywhere in posts / published_posts rows. */
async function loadReferencedNames(bucket) {
  const referenced = new Set()
  const pattern = new RegExp(`/${bucket}/+([^/?#"]+)`, 'g')
  for (const table of ['posts', 'published_posts']) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin.from(table).select('*').range(offset, offset + PAGE - 1)
      if (error) break // table may not exist; treat as no references
      for (const row of data || []) {
        for (const match of JSON.stringify(row).matchAll(pattern)) {
          referenced.add(decodeURIComponent(match[1]))
        }
      }
      if (!data || data.length < PAGE) break
    }
  }
  return referenced
}

async function remove(bucket, paths) {
  let removed = 0
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const batch = paths.slice(i, i + REMOVE_BATCH)
    const { error } = await admin.storage.from(bucket).remove(batch)
    if (error) throw new Error(`remove in ${bucket}: ${error.message}`)
    removed += batch.length
  }
  return removed
}

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`

console.log(`Mode: ${APPLY ? 'APPLY (deleting)' : 'DRY RUN (no deletes)'}\n`)

const { data: wsRows, error: wsError } = await admin.from('workspaces').select('id')
if (wsError) throw new Error(`load workspaces: ${wsError.message}`)
const workspaceIds = new Set((wsRows || []).map((row) => row.id))

let totalDeleted = 0
let totalBytes = 0

for (const bucket of BUCKETS) {
  console.log(`=== Bucket: ${bucket} ===`)
  const referenced = await loadReferencedNames(bucket)
  const rootEntries = await listAll(bucket, '')

  // 1. Root-level files: delete unless a post still references them.
  const rootFiles = rootEntries.filter((entry) => entry.id !== null)
  const keep = rootFiles.filter((file) => referenced.has(file.name))
  const drop = rootFiles.filter((file) => !referenced.has(file.name))
  const dropBytes = drop.reduce((sum, file) => sum + (file.metadata?.size ?? 0), 0)

  for (const file of keep) console.log(`  KEEP (referenced by a post): ${file.name}`)
  console.log(`  Root-level: ${drop.length} deletable (${mb(dropBytes)}), ${keep.length} kept`)

  // 2. Deleted-workspace trees under the legacy generated/ prefix.
  const deadPaths = []
  let deadBytes = 0
  for (const folder of rootEntries.filter((entry) => entry.id === null)) {
    const isLegacyRoot = folder.name === 'generated'
    const candidates = isLegacyRoot ? await listAll(bucket, 'generated') : [folder]
    for (const sub of candidates) {
      const prefix = isLegacyRoot ? `generated/${sub.name}` : sub.name
      if (sub.id !== null || !UUID_RE.test(sub.name) || workspaceIds.has(sub.name)) continue
      for (const file of await listAll(bucket, prefix)) {
        if (file.id === null) continue
        deadPaths.push(`${prefix}/${file.name}`)
        deadBytes += file.metadata?.size ?? 0
      }
    }
  }
  console.log(`  Deleted-workspace files: ${deadPaths.length} deletable (${mb(deadBytes)})`)

  if (APPLY) {
    const removed = await remove(bucket, [...drop.map((file) => file.name), ...deadPaths])
    console.log(`  Deleted ${removed} objects`)
    totalDeleted += removed
  }
  totalBytes += dropBytes + deadBytes
  console.log('')
}

console.log(`=== Summary ===`)
console.log(APPLY ? `Deleted ${totalDeleted} objects, freed ${mb(totalBytes)}` : `Would delete ${mb(totalBytes)} (dry run)`)
