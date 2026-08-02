import { createHmac, randomBytes, timingSafeEqual } from "crypto"

export interface DeveloperApiToken {
  plaintext: string
  prefix: string
}

function base64Url(bytes: Buffer): string {
  return bytes.toString("base64url")
}

export function createDeveloperApiToken(): DeveloperApiToken {
  const publicId = base64Url(randomBytes(12))
  const secret = base64Url(randomBytes(32))
  const prefix = `sf_live_${publicId}`
  return {
    plaintext: `${prefix}_${secret}`,
    prefix,
  }
}

export function parseDeveloperApiTokenPrefix(token: string): string | null {
  const match = token.match(/^(sf_live_[A-Za-z0-9_-]{16})_[A-Za-z0-9_-]{43}$/)
  return match?.[1] ?? null
}

export function hashDeveloperApiToken(token: string, pepper: string): string {
  if (!pepper.trim()) throw new Error("DEVELOPER_API_KEY_PEPPER is required")
  return createHmac("sha256", pepper).update(token, "utf8").digest("hex")
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.byteLength !== right.byteLength) return false
  return timingSafeEqual(left, right)
}

function getLegacyDeveloperApiPepperFallback(): string {
  return process.env.NEXTAUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ""
}

export function getDeveloperApiKeyPeppers(): string[] {
  const primary = process.env.DEVELOPER_API_KEY_PEPPER || getLegacyDeveloperApiPepperFallback()
  if (!primary.trim()) throw new Error("DEVELOPER_API_KEY_PEPPER is required")

  const previous = String(process.env.DEVELOPER_API_KEY_PEPPER_PREVIOUS || "").trim()
  return previous && previous !== primary ? [primary, previous] : [primary]
}

export function getDeveloperApiKeyPepper(): string {
  return getDeveloperApiKeyPeppers()[0]!
}
