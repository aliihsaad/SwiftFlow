import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const SECRET_PREFIX = "enc:v1:"

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "")
}

function fromBase64Url(value: string): Buffer {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/")
  const remainder = padded.length % 4
  const base64 = remainder === 0 ? padded : `${padded}${"=".repeat(4 - remainder)}`
  return Buffer.from(base64, "base64")
}

function getEncryptionSeed(): string {
  const seed = process.env.APP_SECRETS_ENCRYPTION_KEY || process.env.SECRETS_ENCRYPTION_KEY || ""
  if (!seed.trim()) {
    throw new Error("Secret encryption is not configured (missing APP_SECRETS_ENCRYPTION_KEY)")
  }
  return seed
}

function getAesKey(): Buffer {
  // Derive a stable 32-byte AES key from the env secret.
  return createHash("sha256").update(getEncryptionSeed(), "utf8").digest()
}

export function isEncryptedSecret(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(SECRET_PREFIX)
}

export function encryptSecretIfNeeded(value: string | null | undefined): string | null {
  if (value == null) return null
  const plain = String(value)
  if (plain.length === 0) return null
  if (isEncryptedSecret(plain)) return plain

  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getAesKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${SECRET_PREFIX}${toBase64Url(iv)}.${toBase64Url(authTag)}.${toBase64Url(ciphertext)}`
}

export function decryptSecretIfNeeded(value: string | null | undefined): string | null {
  if (value == null) return null
  const raw = String(value)
  if (!raw) return null
  if (!isEncryptedSecret(raw)) return raw

  const payload = raw.slice(SECRET_PREFIX.length)
  const [ivPart, tagPart, cipherPart] = payload.split(".")
  if (!ivPart || !tagPart || !cipherPart) {
    throw new Error("Invalid encrypted secret payload format")
  }

  const iv = fromBase64Url(ivPart)
  const authTag = fromBase64Url(tagPart)
  const ciphertext = fromBase64Url(cipherPart)

  const decipher = createDecipheriv("aes-256-gcm", getAesKey(), iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString("utf8")
}

export function normalizeOptionalSecretInput(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "")
  return trimmed.length > 0 ? trimmed : null
}

