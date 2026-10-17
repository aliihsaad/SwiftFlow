import { readFile, realpath } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { sha256 } from './crypto.mjs'
const root = await realpath(process.argv[2])
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'))
if (manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length < 5) throw new Error('Invalid manifest')
for (const file of manifest.files) {
  const path = await realpath(resolve(root, file.name)), rel = relative(root, path)
  if (isAbsolute(rel) || rel.startsWith('..')) throw new Error('Unsafe manifest path')
  const bytes = await readFile(path)
  if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error('Backup file integrity check failed')
}
console.log(JSON.stringify({ verifiedFiles: manifest.files.length, startedAt: manifest.startedAt, storageObjects: manifest.objectCount }))
