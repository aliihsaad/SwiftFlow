// @ts-nocheck - Deno runtime helper

const SECRET_PREFIX_V1 = "enc:v1:"
const SECRET_PREFIX_V2 = "enc:v2:"
const V2_AAD_PREFIX = "swiftflow:secret:v2:"
const encoder = new TextEncoder()
const decoder = new TextDecoder()

type SecretKeyMaterial = {
  id: string
  key: CryptoKey
}

const cachedKeyPromises = new Map<string, Promise<SecretKeyMaterial>>()

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "")
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = base64.length % 4 === 0 ? base64 : `${base64}${"=".repeat(4 - (base64.length % 4))}`
  return base64ToBytes(padded)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function getCurrentEncryptionSeed(): string {
  const seed = Deno.env.get("APP_SECRETS_ENCRYPTION_KEY") || Deno.env.get("SECRETS_ENCRYPTION_KEY") || ""
  if (!seed.trim()) throw new Error("Secret encryption is not configured (missing APP_SECRETS_ENCRYPTION_KEY)")
  return seed
}

function deriveKeyMaterial(seed: string): Promise<SecretKeyMaterial> {
  const cached = cachedKeyPromises.get(seed)
  if (cached) return cached

  const pending = (async () => {
    const keyBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(seed)))
    const idBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`swiftflow:key-id:${seed}`)))
    return {
      id: bytesToHex(idBytes).slice(0, 16),
      key: await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]),
    }
  })()
  cachedKeyPromises.set(seed, pending)
  return pending
}

async function getKeyMaterials(): Promise<SecretKeyMaterial[]> {
  const current = await deriveKeyMaterial(getCurrentEncryptionSeed())
  const previousSeed = String(Deno.env.get("APP_SECRETS_ENCRYPTION_KEY_PREVIOUS") || "").trim()
  if (!previousSeed) return [current]
  const previous = await deriveKeyMaterial(previousSeed)
  return previous.id === current.id ? [current] : [current, previous]
}

function shouldWriteV2(): boolean {
  return String(Deno.env.get("APP_SECRETS_ENCRYPTION_VERSION") || "v1").trim().toLowerCase() === "v2"
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

async function encryptWithMaterial(
  plain: string,
  material: SecretKeyMaterial,
  version: "v1" | "v2",
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const additionalData = version === "v2" ? encoder.encode(`${V2_AAD_PREFIX}${material.id}`) : undefined
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    material.key,
    encoder.encode(plain),
  ))
  const tag = encrypted.slice(encrypted.length - 16)
  const cipher = encrypted.slice(0, encrypted.length - 16)
  const payload = `${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(cipher)}`
  return version === "v2" ? `${SECRET_PREFIX_V2}${material.id}:${payload}` : `${SECRET_PREFIX_V1}${payload}`
}

async function decryptPayload(
  parts: string[],
  material: SecretKeyMaterial,
  additionalData?: Uint8Array,
): Promise<string> {
  const iv = fromBase64Url(parts[0]!)
  const tag = fromBase64Url(parts[1]!)
  const cipher = fromBase64Url(parts[2]!)
  if (iv.byteLength !== 12 || tag.byteLength !== 16) throw new Error("Invalid encrypted secret payload")
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128, additionalData },
    material.key,
    concatBytes(cipher, tag),
  )
  return decoder.decode(plaintext)
}

export function isEncryptedSecret(value: unknown): boolean {
  return typeof value === "string" && (value.startsWith(SECRET_PREFIX_V1) || value.startsWith(SECRET_PREFIX_V2))
}

export async function encryptSecret(value: string | null | undefined): Promise<string | null> {
  if (value == null) return null
  const plain = String(value)
  if (!plain) return null
  const current = (await getKeyMaterials())[0]!
  return await encryptWithMaterial(plain, current, shouldWriteV2() ? "v2" : "v1")
}

export async function encryptSecretIfNeeded(value: string | null | undefined): Promise<string | null> {
  if (value == null) return null
  const plain = String(value)
  if (!plain) return null
  return isEncryptedSecret(plain) ? plain : await encryptSecret(plain)
}

export async function decryptSecretIfNeeded(value: string | null | undefined): Promise<string | null> {
  if (value == null) return null
  const raw = String(value)
  if (!raw) return null
  if (!isEncryptedSecret(raw)) return raw

  const materials = await getKeyMaterials()
  if (raw.startsWith(SECRET_PREFIX_V2)) {
    const payload = raw.slice(SECRET_PREFIX_V2.length)
    const separator = payload.indexOf(":")
    if (separator <= 0) throw new Error("Invalid encrypted secret payload format")
    const keyId = payload.slice(0, separator)
    const parts = payload.slice(separator + 1).split(".")
    if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("Invalid encrypted secret payload format")
    const material = materials.find((candidate) => candidate.id === keyId)
    if (!material) throw new Error(`Secret encryption key ${keyId} is not configured`)
    return await decryptPayload(parts, material, encoder.encode(`${V2_AAD_PREFIX}${keyId}`))
  }

  const parts = raw.slice(SECRET_PREFIX_V1.length).split(".")
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("Invalid encrypted secret payload format")
  for (const material of materials) {
    try {
      return await decryptPayload(parts, material)
    } catch {
      // Try the next configured key.
    }
  }
  throw new Error("Unable to decrypt secret with the configured encryption keys")
}

export async function needsSecretReencryption(value: string | null | undefined): Promise<boolean> {
  if (value == null || value === "") return false
  if (!isEncryptedSecret(value)) return true
  if (!shouldWriteV2()) return false
  if (value.startsWith(SECRET_PREFIX_V1)) return true
  const payload = value.slice(SECRET_PREFIX_V2.length)
  const separator = payload.indexOf(":")
  if (separator <= 0) return true
  return payload.slice(0, separator) !== (await getKeyMaterials())[0]!.id
}

export async function reencryptSecretIfNeeded(value: string | null | undefined): Promise<string | null> {
  if (!(await needsSecretReencryption(value))) return value ?? null
  return await encryptSecret(await decryptSecretIfNeeded(value))
}
