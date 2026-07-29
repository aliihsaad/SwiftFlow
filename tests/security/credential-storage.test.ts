import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  decryptSecretIfNeeded,
  encryptSecret,
  encryptSecretIfNeeded,
  getSecretEncryptionConfigStatus,
  isEncryptedSecret,
  needsSecretReencryption,
  reencryptSecretIfNeeded,
} from "@/lib/secret-crypto"
import {
  buildExternalServiceCreatePayload,
  buildExternalServiceUpdatePayload,
  revealExternalServiceSecret,
  sanitizeExternalServiceForClient,
  type ExternalServiceRow,
} from "@/lib/external-service-credentials"
import {
  createDeveloperApiToken,
  hashDeveloperApiToken,
  getDeveloperApiKeyPeppers,
  parseDeveloperApiTokenPrefix,
} from "@/lib/developer-api/key-format"

const root = process.cwd()
const MANAGED_ENV_KEYS = [
  "APP_SECRETS_ENCRYPTION_KEY",
  "SECRETS_ENCRYPTION_KEY",
  "APP_SECRETS_ENCRYPTION_KEY_PREVIOUS",
  "APP_SECRETS_ENCRYPTION_VERSION",
  "DEVELOPER_API_KEY_PEPPER",
  "DEVELOPER_API_KEY_PEPPER_PREVIOUS",
] as const
const originalEnv = new Map<string, string | undefined>()

function source(...segments: string[]) {
  return readFileSync(path.join(root, ...segments), "utf8")
}

function setEncryptionEnv(current: string, version: "v1" | "v2" = "v1", previous?: string) {
  process.env.APP_SECRETS_ENCRYPTION_KEY = current
  process.env.APP_SECRETS_ENCRYPTION_VERSION = version
  delete process.env.SECRETS_ENCRYPTION_KEY
  if (previous) process.env.APP_SECRETS_ENCRYPTION_KEY_PREVIOUS = previous
  else delete process.env.APP_SECRETS_ENCRYPTION_KEY_PREVIOUS
}

beforeEach(() => {
  for (const key of MANAGED_ENV_KEYS) originalEnv.set(key, process.env[key])
  setEncryptionEnv("test-current-key-with-at-least-thirty-two-bytes")
})

afterEach(() => {
  for (const key of MANAGED_ENV_KEYS) {
    const value = originalEnv.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  originalEnv.clear()
})

describe("credential encryption", () => {
  it("keeps legacy v1 payloads readable and authenticated", () => {
    const encrypted = encryptSecret("meta-access-token")
    expect(encrypted).toMatch(/^enc:v1:/)
    expect(isEncryptedSecret(encrypted)).toBe(true)
    expect(decryptSecretIfNeeded(encrypted)).toBe("meta-access-token")
    expect(encrypted).not.toContain("meta-access-token")
  })

  it("writes keyed v2 payloads with authenticated key identity", () => {
    setEncryptionEnv("test-current-key-with-at-least-thirty-two-bytes", "v2")
    const encrypted = encryptSecret("workspace-api-key")

    expect(encrypted).toMatch(/^enc:v2:[a-f0-9]{16}:/)
    expect(decryptSecretIfNeeded(encrypted)).toBe("workspace-api-key")
    expect(getSecretEncryptionConfigStatus()).toMatchObject({
      writeVersion: "v2",
      hasPreviousKey: false,
    })

    const tampered = `${encrypted!.slice(0, -1)}${encrypted!.endsWith("A") ? "B" : "A"}`
    expect(() => decryptSecretIfNeeded(tampered)).toThrow()
  })

  it("supports a current-plus-previous key rotation without losing v1 or v2 records", () => {
    setEncryptionEnv("old-key-material-with-at-least-thirty-two-bytes")
    const oldV1 = encryptSecret("old-meta-token")

    setEncryptionEnv(
      "new-key-material-with-at-least-thirty-two-bytes",
      "v2",
      "old-key-material-with-at-least-thirty-two-bytes",
    )
    expect(decryptSecretIfNeeded(oldV1)).toBe("old-meta-token")
    expect(needsSecretReencryption(oldV1)).toBe(true)

    const upgraded = reencryptSecretIfNeeded(oldV1)
    expect(upgraded).toMatch(/^enc:v2:/)
    expect(decryptSecretIfNeeded(upgraded)).toBe("old-meta-token")

    const newV2 = encryptSecret("new-meta-token")
    setEncryptionEnv(
      "third-key-material-with-at-least-thirty-two-bytes",
      "v2",
      "new-key-material-with-at-least-thirty-two-bytes",
    )
    expect(decryptSecretIfNeeded(newV2)).toBe("new-meta-token")
  })

  it("does not trust an enc prefix supplied as plaintext", () => {
    const attackerControlled = "enc:v1:not-actually-ciphertext"
    const encrypted = encryptSecret(attackerControlled)

    expect(encrypted).not.toBe(attackerControlled)
    expect(decryptSecretIfNeeded(encrypted)).toBe(attackerControlled)
    expect(encryptSecretIfNeeded(encrypted)).toBe(encrypted)
  })
})

describe("external-service credential boundary", () => {
  const storedRow = (): ExternalServiceRow => ({
    id: "11111111-1111-4111-8111-111111111111",
    workspace_id: "22222222-2222-4222-8222-222222222222",
    service_name: "Example",
    website: "https://example.com",
    email: "owner@example.com",
    password: encryptSecret("stored-password"),
    subscription_tier: "Pro",
    price: "$20",
    api_key: encryptSecret("stored-api-key"),
    created_at: "2026-07-28T00:00:00.000Z",
  })

  it("returns only presence metadata in normal list responses", () => {
    const sanitized = sanitizeExternalServiceForClient(storedRow())

    expect(sanitized.password).toBeNull()
    expect(sanitized.api_key).toBeNull()
    expect(sanitized.has_password).toBe(true)
    expect(sanitized.has_api_key).toBe(true)
    expect(JSON.stringify(sanitized)).not.toContain("stored-password")
    expect(JSON.stringify(sanitized)).not.toContain("stored-api-key")
  })

  it("preserves blank secrets on update and supports explicit replace or remove", () => {
    const preserved = buildExternalServiceUpdatePayload({ service_name: "Example" })
    expect(preserved).not.toHaveProperty("password")
    expect(preserved).not.toHaveProperty("api_key")

    const replaced = buildExternalServiceUpdatePayload({
      service_name: "Example",
      password: "new-password",
      api_key: "new-api-key",
    })
    expect(decryptSecretIfNeeded(replaced.password as string)).toBe("new-password")
    expect(decryptSecretIfNeeded(replaced.api_key as string)).toBe("new-api-key")

    const removed = buildExternalServiceUpdatePayload({
      service_name: "Example",
      clear_password: true,
      clear_api_key: true,
    })
    expect(removed.password).toBeNull()
    expect(removed.api_key).toBeNull()
  })

  it("encrypts new browser credentials and reveals only one selected field", () => {
    const created = buildExternalServiceCreatePayload({
      service_name: "Example",
      password: "created-password",
      api_key: "created-api-key",
    })
    expect(created.password).toMatch(/^enc:v1:/)
    expect(created.api_key).toMatch(/^enc:v1:/)

    const row = { password: created.password, api_key: created.api_key }
    expect(revealExternalServiceSecret(row, "password")).toBe("created-password")
    expect(revealExternalServiceSecret(row, "api_key")).toBe("created-api-key")
  })

  it("keeps decryption out of list and mutation responses", () => {
    const collectionRoute = source("app", "api", "external-services", "route.ts")
    const itemRoute = source("app", "api", "external-services", "[id]", "route.ts")
    const revealRoute = source("app", "api", "external-services", "[id]", "reveal", "route.ts")

    expect(collectionRoute).not.toContain("decryptSecretIfNeeded")
    expect(itemRoute).not.toContain("decryptSecretIfNeeded")
    expect(collectionRoute).toContain("sanitizeExternalServiceForClient")
    expect(itemRoute).toContain("sanitizeExternalServiceForClient")
    expect(revealRoute).toContain("assertSameOrigin(request)")
    expect(revealRoute).toContain("credential-reveal:user")
    expect(revealRoute).toContain('"Cache-Control": "private, no-store, max-age=0"')
    expect(collectionRoute).toContain('new WorkspacePermissionError("Unauthorized", 401)')
    expect(itemRoute).toContain('new WorkspacePermissionError("Unauthorized", 401)')
    expect(collectionRoute).not.toContain('throw new Error("Unauthorized")')
    expect(itemRoute).not.toContain('throw new Error("Unauthorized")')
  })
})

describe("developer API credentials", () => {
  it("stores opaque tokens as keyed HMACs rather than reversible ciphertext", () => {
    const token = createDeveloperApiToken()
    const hash = hashDeveloperApiToken(token.plaintext, "dedicated-test-pepper")

    expect(parseDeveloperApiTokenPrefix(token.plaintext)).toBe(token.prefix)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).not.toContain(token.plaintext)
    expect(hashDeveloperApiToken(token.plaintext, "other-pepper")).not.toBe(hash)
  })

  it("supports a current-plus-previous HMAC pepper during rotation", () => {
    process.env.DEVELOPER_API_KEY_PEPPER = "new-dedicated-pepper-with-at-least-thirty-two-bytes"
    process.env.DEVELOPER_API_KEY_PEPPER_PREVIOUS = "old-pepper-with-at-least-thirty-two-bytes"

    expect(getDeveloperApiKeyPeppers()).toEqual([
      "new-dedicated-pepper-with-at-least-thirty-two-bytes",
      "old-pepper-with-at-least-thirty-two-bytes",
    ])
  })
})

describe("browser-callable settings actions", () => {
  it("never decrypts provider keys inside the server-action module", () => {
    const actions = source("app", "actions", "settings.ts")
    const trustedReader = source("lib", "workspace-settings.ts")

    expect(actions).not.toContain("decryptSecretIfNeeded")
    expect(actions).toContain("sanitizeWorkspaceSettingsForClient")
    expect(trustedReader).toContain('import "server-only"')
    expect(trustedReader).toContain("getWorkspaceSettingsWithSecrets")
  })

  it("keeps Node and Edge encryption readers aligned for rotation", () => {
    const edgeCrypto = source("supabase", "functions", "_shared", "secret-crypto.ts")
    expect(edgeCrypto).toContain('const SECRET_PREFIX_V2 = "enc:v2:"')
    expect(edgeCrypto).toContain("APP_SECRETS_ENCRYPTION_KEY_PREVIOUS")
    expect(edgeCrypto).toContain("APP_SECRETS_ENCRYPTION_VERSION")
    expect(edgeCrypto).toContain("additionalData")
  })
})
