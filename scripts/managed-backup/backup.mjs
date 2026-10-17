import { execFile, spawn } from 'node:child_process'
import { mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { encryptBackup, sha256 } from './crypto.mjs'

process.umask(0o077)
const required = ['SUPABASE_DB_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'APP_SECRETS_ENCRYPTION_KEY', 'BACKUP_PUBLIC_KEY']
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name}`)
const url = new URL(process.env.SUPABASE_URL)
const connection = new URL(process.env.SUPABASE_DB_URL)
if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) throw new Error('Expected a hosted Supabase project')
if (connection.port && connection.port !== '5432') throw new Error('Backups require the direct connection or session pooler on port 5432')
const project = url.hostname.split('.')[0]
if (!(connection.hostname === `db.${project}.supabase.co` || (connection.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(connection.username).endsWith(`.${project}`)))) throw new Error('Database and Storage project mismatch')
connection.searchParams.set('sslmode', 'require')
const work = await mkdtemp(join(tmpdir(), 'swiftflow-backup-'))
const payload = join(work, 'payload'), output = resolve(process.env.BACKUP_OUTPUT_DIR || 'backup-output')
await mkdir(payload); await mkdir(output, { recursive: true })
const startedAt = new Date().toISOString()

const pgEnv = {
  ...process.env, PGHOST: connection.hostname, PGPORT: connection.port || '5432', PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password), PGDATABASE: connection.pathname.slice(1), PGSSLMODE: 'verify-full', PGSSLROOTCERT: fileURLToPath(new URL('./supabase-ca.crt', import.meta.url)), PGCONNECT_TIMEOUT: '15', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=3000',
}

function run(command, args, timeout = 300_000, env = process.env, input, outputFd) {
  return new Promise((accept, reject) => {
    // Never echo provider output: dumps and connection errors can contain secrets.
    const child = spawn(command, args, { stdio: [input ? 'pipe' : 'ignore', outputFd ?? 'pipe', 'pipe'], windowsHide: true, timeout, env })
    let diagnostic = ''
    child.stdout?.on('data', chunk => { if (diagnostic.length < 16000) diagnostic += chunk.toString() })
    child.stderr.on('data', chunk => { if (diagnostic.length < 16000) diagnostic += chunk.toString() })
    if (input) child.stdin.end(input)
    child.on('error', () => reject(new Error(`${command} could not start`)))
    child.on('close', code => {
      if (code === 0) return accept()
      // Emit only known diagnostic categories, never raw stderr (which can
      // contain a password, SQL row, connection string or provider payload).
      const categories = [
        [/unknown (?:flag|option)/i, 'unsupported CLI option'],
        [/access token|not logged in/i, 'CLI requested management authentication'],
        [/cannot connect.*docker|docker daemon/i, 'Docker unavailable'],
        [/permission denied/i, 'permission denied'],
        [/password authentication failed/i, 'database authentication failed'],
        [/certificate|ssl/i, 'TLS connection error'],
        [/timeout|timed out/i, 'connection timed out'],
        [/config|project ref/i, 'CLI project configuration required'],
        [/image|manifest/i, 'database image unavailable'],
      ]
      const hint = categories.find(([pattern]) => pattern.test(diagnostic))?.[1] || 'unclassified tool error'
      reject(new Error(`${command} failed (${code}): ${hint}; provider details suppressed`))
    })
  })
}

async function api(path, body) {
  const response = await fetch(`${url.origin}/storage/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`Storage backup request failed (${response.status})`)
  return response
}

async function backupStorage() {
  const buckets = await (await api('bucket')).json(), objects = []
  let totalBytes = 0
  await mkdir(join(payload, 'objects'))
  for (const bucket of buckets) {
    const folders = ['']
    for (let f = 0; f < folders.length; f++) {
      if (folders.length > 10000) throw new Error('Storage directory safety cap reached')
      for (let offset = 0; ; offset += 100) {
        const entries = await (await api(`object/list/${encodeURIComponent(bucket.id)}`, { prefix: folders[f], limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })).json()
        if (!Array.isArray(entries)) throw new Error('Unexpected Storage listing')
        for (const entry of entries) {
          const name = `${folders[f]}${entry.name}`
          if (!entry.id) { folders.push(`${name}/`); continue }
          if (objects.length >= 10000) throw new Error('Storage object safety cap reached')
          const response = await api(`object/${encodeURIComponent(bucket.id)}/${name.split('/').map(encodeURIComponent).join('/')}`)
          const chunks = []
          for await (const chunk of response.body) {
            totalBytes += chunk.length
            if (totalBytes > 64 * 1024 * 1024) throw new Error('Storage backup exceeds the 64 MiB download safety cap')
            chunks.push(chunk)
          }
          const bytes = Buffer.concat(chunks), file = `objects/${objects.length}.bin`
          await writeFile(join(payload, file), bytes, { flag: 'wx' })
          objects.push({ bucket: bucket.id, name, file, bytes: bytes.length, sha256: sha256(bytes), contentType: entry.metadata?.mimetype, updatedAt: entry.updated_at })
        }
        if (entries.length < 100) break
      }
    }
  }
  await writeFile(join(payload, 'storage.json'), JSON.stringify({ buckets, objects }, null, 2))
  return objects.length
}

try {
  // CLI pg_dump runs are SELECT-only and use MVCC. All application data,
  // including queue/checkpoints/deduplication, is in ONE consistent data dump.
  const dump = async (file, flags) => {
    console.log(`Backing up ${file}`)
    const options = [...(!flags.includes('--data-only') ? ['--keep-comments'] : []), ...flags]
    if (process.platform === 'linux') {
      // Reuse the pinned CLI's official dump/filter script with the installed
      // PostgreSQL client. No Docker image or management login is required.
      // Generate with dummy credentials, then supply real credentials only in
      // the child environment. This also enforces CA-verified TLS for every dump.
      let script
      try {
        const result = await promisify(execFile)('supabase', ['db', 'dump', '--dry-run', '--db-url', 'postgresql://backup:unused@127.0.0.1:5432/postgres', ...options], { timeout: 60_000, maxBuffer: 1024 * 1024 })
        let replaced = 0
        script = result.stdout.replace(/^export PG(?:HOST|PORT|USER|PASSWORD|DATABASE)=.*$/gm, () => { replaced++; return '' })
        if (replaced !== 5 || !script.startsWith('#!/usr/bin/env bash')) throw new Error('Unexpected CLI script')
      } catch { throw new Error('Could not generate the expected official Supabase dump script') }
      const handle = await open(join(payload, file), 'wx', 0o600)
      try { await run('bash', ['--noprofile', '--norc', '-s'], 300_000, pgEnv, script, handle.fd) }
      finally { await handle.close() }
    } else {
      await run('supabase', ['db', 'dump', '--db-url', connection.href, '--file', join(payload, file), ...options])
    }
    const bytes = await readFile(join(payload, file))
    if (bytes.length < 100 || !bytes.toString().includes('dump complete')) throw new Error(`Incomplete ${file}`)
  }
  await dump('roles.sql', ['--role-only'])
  await dump('schema.sql', [])
  await dump('data.sql', ['--data-only', '--use-copy', '--exclude', 'cron.job,cron.job_run_details,net.http_request_queue,net._http_response'])
  await dump('migration-history.sql', ['--data-only', '--use-copy', '--schema', 'supabase_migrations'])
  // Supplement the official CLI's schema exclusions for a complete recovery
  // reference, including custom auth triggers and storage policies. Restoring
  // this managed baseline is for an ISOLATED rehearsal, not a fresh hosted DB.
  await run('pg_dump', ['--schema-only', '--no-owner', '--schema=auth', '--schema=storage', '--schema=supabase_functions', '--schema=supabase_migrations', '--file', join(payload, 'managed-schema-reference.sql')], 300_000, pgEnv)
  const objectCount = await backupStorage()
  await writeFile(join(payload, 'recovery-secrets.json'), JSON.stringify({ APP_SECRETS_ENCRYPTION_KEY: process.env.APP_SECRETS_ENCRYPTION_KEY }))
  const files = []
  async function inventory(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = `${prefix}${entry.name}`
      if (entry.isDirectory()) await inventory(join(directory, entry.name), `${name}/`)
      else { const bytes = await readFile(join(directory, entry.name)); files.push({ name, bytes: bytes.length, sha256: sha256(bytes) }) }
    }
  }
  await inventory(payload)
  await writeFile(join(payload, 'manifest.json'), JSON.stringify({ version: 1, project, startedAt, finishedAt: new Date().toISOString(), objectCount, files, excluded: ['cron execution/configuration data', 'pg_net queue/response data', 'platform-managed internal schemas'], restoreSafety: 'Keep ALL campaigns paused and cron/webhooks disconnected until post-backup deliveries are reconciled. See the restore runbook.' }, null, 2))
  const archive = join(work, 'backup.tar.gz')
  await run('tar', ['-czf', archive, '-C', payload, '.'])
  const encrypted = encryptBackup(await readFile(archive), process.env.BACKUP_PUBLIC_KEY)
  const name = `swiftflow-${startedAt.slice(0, 10)}.sfb`
  await writeFile(join(output, name), encrypted, { flag: 'wx', mode: 0o600 })
  await writeFile(join(output, `${name}.sha256`), `${sha256(encrypted)}  ${name}\n`, { flag: 'wx' })
  const bytes = (await stat(join(output, name))).size
  console.log(JSON.stringify({ success: true, encryptedBytes: bytes, storageObjects: objectCount, startedAt }))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  // Only remove the exact temporary directory created above, never a supplied path.
  await rm(work, { recursive: true, force: true })
}
