import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const SECRET_PREFIX_V1 = "enc:v1:"
const SECRET_PREFIX_V2 = "enc:v2:"
const V2_AAD_PREFIX = "swiftflow:secret:v2:"

type SecretKeyMaterial = {
  id: string
  key: Buffer
}

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

function getCurrentEncryptionSeed(): string {
  const seed = process.env.APP_SECRETS_ENCRYPTION_KEY || process.env.SECRETS_ENCRYPTION_KEY || ""
  if (!seed.trim()) {
    throw new Error("Secret encryption is not configured (missing APP_SECRETS_ENCRYPTION_KEY)")
  }
  return seed
}

function deriveKeyMaterial(seed: string): SecretKeyMaterial {
  const key = createHash("sha256").update(seed, "utf8").digest()
  const id = createHash("sha256")
    .update("swiftflow:key-id:", "utf8")
    .update(seed, "utf8")
    .digest("hex")
    .slice(0, 16)
  return { id, key }
}

function getKeyMaterials(): SecretKeyMaterial[] {
  const current = deriveKeyMaterial(getCurrentEncryptionSeed())
  const previousSeed = String(process.env.APP_SECRETS_ENCRYPTION_KEY_PREVIOUS || "").trim()
  if (!previousSeed) return [current]

  const previous = deriveKeyMaterial(previousSeed)
  return previous.id === current.id ? [current] : [current, previous]
}

function shouldWriteV2(): boolean {
  return String(process.env.APP_SECRETS_ENCRYPTION_VERSION || "v1").trim().toLowerCase() === "v2"
}

function encryptSecretV1(plain: string, material: SecretKeyMaterial): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", material.key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${SECRET_PREFIX_V1}${toBase64Url(iv)}.${toBase64Url(authTag)}.${toBase64Url(ciphertext)}`
}

function encryptSecretV2(plain: string, material: SecretKeyMaterial): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", material.key, iv)
  cipher.setAAD(Buffer.from(`${V2_AAD_PREFIX}${material.id}`, "utf8"))
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${SECRET_PREFIX_V2}${material.id}:${toBase64Url(iv)}.${toBase64Url(authTag)}.${toBase64Url(ciphertext)}`
}

function decryptPayload(
  ivPart: string,
  tagPart: string,
  cipherPart: string,
  material: SecretKeyMaterial,
  aad?: string,
): string {
  const iv = fromBase64Url(ivPart)
  const authTag = fromBase64Url(tagPart)
  const ciphertext = fromBase64Url(cipherPart)
  if (iv.byteLength !== 12 || authTag.byteLength !== 16) {
    throw new Error("Invalid encrypted secret payload")
  }

  const decipher = createDecipheriv("aes-256-gcm", material.key, iv)
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"))
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString("utf8")
}

export function isEncryptedSecret(value: unknown): boolean {
  return typeof value === "string" &&
    (value.startsWith(SECRET_PREFIX_V1) || value.startsWith(SECRET_PREFIX_V2))
}

/**
 * Encrypts untrusted plaintext even when it happens to begin with an enc:* prefix.
 * Use this for browser/provider input. Use encryptSecretIfNeeded only for values
 * that may already have come from trusted storage.
 */
export function encryptSecret(value: string | null | undefined): string | null {
  if (value == null) return null
  const plain = String(value)
  if (plain.length === 0) return null

  const current = getKeyMaterials()[0]!
  return shouldWriteV2()
    ? encryptSecretV2(plain, current)
    : encryptSecretV1(plain, current)
}

export function encryptSecretIfNeeded(value: string | null | undefined): string | null {
  if (value == null) return null
  const plain = String(value)
  if (plain.length === 0) return null
  return isEncryptedSecret(plain) ? plain : encryptSecret(plain)
}

export function decryptSecretIfNeeded(value: string | null | undefined): string | null {
  if (value == null) return null
  const raw = String(value)
  if (!raw) return null
  if (!isEncryptedSecret(raw)) return raw

  const materials = getKeyMaterials()

  if (raw.startsWith(SECRET_PREFIX_V2)) {
    const payload = raw.slice(SECRET_PREFIX_V2.length)
    const separator = payload.indexOf(":")
    if (separator <= 0) throw new Error("Invalid encrypted secret payload format")

    const keyId = payload.slice(0, separator)
    const parts = payload.slice(separator + 1).split(".")
    if (parts.length !== 3 || parts.some((part) => !part)) {
      throw new Error("Invalid encrypted secret payload format")
    }

    const material = materials.find((candidate) => candidate.id === keyId)
    if (!material) {
      throw new Error(`Secret encryption key ${keyId} is not configured`)
    }

    return decryptPayload(parts[0]!, parts[1]!, parts[2]!, material, `${V2_AAD_PREFIX}${keyId}`)
  }

  const parts = raw.slice(SECRET_PREFIX_V1.length).split(".")
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error("Invalid encrypted secret payload format")
  }

  // Legacy v1 payloads have no key identifier. Trying current and then previous
  // keeps existing records readable during a controlled rotation.
  for (const material of materials) {
    try {
      return decryptPayload(parts[0]!, parts[1]!, parts[2]!, material)
    } catch {
      // Try the next configured key.
    }
  }
  throw new Error("Unable to decrypt secret with the configured encryption keys")
}

export function needsSecretReencryption(value: string | null | undefined): boolean {
  if (value == null || value === "") return false
  if (!isEncryptedSecret(value)) return true
  if (!shouldWriteV2()) return false
  if (value.startsWith(SECRET_PREFIX_V1)) return true

  const payload = value.slice(SECRET_PREFIX_V2.length)
  const separator = payload.indexOf(":")
  if (separator <= 0) return true
  const keyId = payload.slice(0, separator)
  return keyId !== getKeyMaterials()[0]!.id
}

export function reencryptSecretIfNeeded(value: string | null | undefined): string | null {
  if (!needsSecretReencryption(value)) return value ?? null
  return encryptSecret(decryptSecretIfNeeded(value))
}

export function getSecretEncryptionConfigStatus(): {
  writeVersion: "v1" | "v2"
  currentKeyId: string
  hasPreviousKey: boolean
} {
  const materials = getKeyMaterials()
  return {
    writeVersion: shouldWriteV2() ? "v2" : "v1",
    currentKeyId: materials[0]!.id,
    hasPreviousKey: materials.length > 1,
  }
}

export function normalizeOptionalSecretInput(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "")
  return trimmed.length > 0 ? trimmed : null
}
