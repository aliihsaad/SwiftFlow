import { createCipheriv, createDecipheriv, createHash, generateKeyPairSync, publicEncrypt, privateDecrypt, randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const MAGIC = Buffer.from('SWIFTFLOW-BACKUP-1\n')
export const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024

export function generateKeys() {
  return generateKeyPairSync('rsa', { modulusLength: 4096, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })
}

// Standard envelope encryption: the runner only needs the public key. The
// private recovery key never goes into GitHub, its secrets, or the archive.
export function encryptBackup(plaintext, publicKey) {
  if (plaintext.length > MAX_ARCHIVE_BYTES) throw new Error('Backup exceeds the 20 MiB free-storage safety cap')
  const key = randomBytes(32), iv = randomBytes(12)
  const wrappedKey = publicEncrypt({ key: publicKey, oaepHash: 'sha256' }, key)
  const header = Buffer.from(JSON.stringify({ algorithm: 'RSA-OAEP-SHA256/AES-256-GCM', key: wrappedKey.toString('base64'), iv: iv.toString('base64') }))
  const length = Buffer.alloc(4); length.writeUInt32BE(header.length)
  const aad = Buffer.concat([MAGIC, length, header])
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aad)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  key.fill(0)
  return Buffer.concat([aad, ciphertext, cipher.getAuthTag()])
}

export function decryptBackup(encrypted, privateKey) {
  if (encrypted.length < MAGIC.length + 4 + 16 || !encrypted.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Invalid backup format')
  const length = encrypted.readUInt32BE(MAGIC.length), end = MAGIC.length + 4 + length
  if (length > 4096 || end + 16 > encrypted.length) throw new Error('Invalid backup header')
  const header = JSON.parse(encrypted.subarray(MAGIC.length + 4, end).toString())
  if (header.algorithm !== 'RSA-OAEP-SHA256/AES-256-GCM') throw new Error('Unsupported backup algorithm')
  const key = privateDecrypt({ key: privateKey, oaepHash: 'sha256' }, Buffer.from(header.key, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(header.iv, 'base64'))
  decipher.setAAD(encrypted.subarray(0, end))
  decipher.setAuthTag(encrypted.subarray(-16))
  // Nothing is written to disk until authentication succeeds.
  const plaintext = Buffer.concat([decipher.update(encrypted.subarray(end, -16)), decipher.final()])
  key.fill(0)
  return plaintext
}

export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, input, output, keyFile] = process.argv.slice(2)
  try {
    if (command === 'keygen') {
      const keys = generateKeys()
      await writeFile(input, keys.privateKey, { flag: 'wx', mode: 0o600 })
      await writeFile(output, keys.publicKey, { flag: 'wx', mode: 0o600 })
    } else if (command === 'decrypt') {
      const bytes = decryptBackup(await readFile(input), await readFile(keyFile))
      await writeFile(output, bytes, { flag: 'wx', mode: 0o600 })
    } else throw new Error('Use keygen PRIVATE PUBLIC or decrypt INPUT OUTPUT PRIVATE')
    console.log('Recovery-key operation completed; no secrets printed.')
  } catch {
    console.error('Recovery-key operation failed. Check paths, key and backup integrity; existing files are never overwritten.')
    process.exitCode = 1
  }
}
