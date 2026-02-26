// @ts-nocheck - Deno runtime helper

const SECRET_PREFIX = "enc:v1:"
const encoder = new TextEncoder()
const decoder = new TextDecoder()

let cachedKeyPromise: Promise<CryptoKey> | null = null

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "")
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = base64.length % 4 === 0 ? base64 : `${base64}${"=".repeat(4 - (base64.length % 4))}`
  return base64ToBytes(padded)
}

async function getAesKey(): Promise<CryptoKey> {
  if (!cachedKeyPromise) {
    cachedKeyPromise = (async () => {
      const seed = Deno.env.get("APP_SECRETS_ENCRYPTION_KEY") || Deno.env.get("SECRETS_ENCRYPTION_KEY") || ""
      if (!seed.trim()) {
        throw new Error("Secret encryption is not configured (missing APP_SECRETS_ENCRYPTION_KEY)")
      }
      const hash = await crypto.subtle.digest("SHA-256", encoder.encode(seed))
      return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"])
    })()
  }
  return cachedKeyPromise
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

export function isEncryptedSecret(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(SECRET_PREFIX)
}

export async function encryptSecretIfNeeded(value: string | null | undefined): Promise<string | null> {
  if (value == null) return null
  const plain = String(value)
  if (!plain) return null
  if (isEncryptedSecret(plain)) return plain

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await getAesKey()
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plain),
  )) // ciphertext + auth tag

  const tag = encrypted.slice(encrypted.length - 16)
  const cipher = encrypted.slice(0, encrypted.length - 16)
  return `${SECRET_PREFIX}${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(cipher)}`
}

export async function decryptSecretIfNeeded(value: string | null | undefined): Promise<string | null> {
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
  const tag = fromBase64Url(tagPart)
  const cipher = fromBase64Url(cipherPart)
  const encrypted = concatBytes(cipher, tag)
  const key = await getAesKey()

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    encrypted,
  )

  return decoder.decode(plaintext)
}

