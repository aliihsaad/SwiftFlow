import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local", override: false, quiet: true })
loadEnv({ path: ".env", override: false, quiet: true })

const channel = String(process.env.APP_RELEASE_CHANNEL || process.env.NEXT_PUBLIC_APP_RELEASE_CHANNEL || "production_full").trim()

const sharedRequired = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
]

const reviewPhase1Required = [
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
]

function getMissing(keys) {
  return keys.filter((key) => !String(process.env[key] || "").trim())
}

function failList(title, keys) {
  console.error(title)
  for (const key of keys) console.error(`- ${key}`)
  process.exit(1)
}

function assertCredentialPair(idName, secretName) {
  const hasId = Boolean(String(process.env[idName] || "").trim())
  const hasSecret = Boolean(String(process.env[secretName] || "").trim())
  if (hasId !== hasSecret) {
    failList(`[validate-env] ${idName} and ${secretName} must be configured together:`, [idName, secretName])
  }
}

function assertStrongSecret(name, value) {
  if (value.length < 32) {
    console.error(`[validate-env] ${name} must contain at least 32 characters of random material`)
    process.exit(1)
  }
}

const missingShared = getMissing(sharedRequired)
if (missingShared.length > 0) {
  failList("[validate-env] Missing required environment variables:", missingShared)
}

const serviceRoleKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "",
).trim()
if (!serviceRoleKey) {
  failList(
    "[validate-env] Missing required environment variables:",
    ["SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY"],
  )
}

const encryptionKey = String(
  process.env.APP_SECRETS_ENCRYPTION_KEY || process.env.SECRETS_ENCRYPTION_KEY || "",
).trim()
if (!encryptionKey) {
  failList(
    "[validate-env] Missing required environment variables:",
    ["APP_SECRETS_ENCRYPTION_KEY"],
  )
}
assertStrongSecret("APP_SECRETS_ENCRYPTION_KEY", encryptionKey)

const encryptionVersion = String(process.env.APP_SECRETS_ENCRYPTION_VERSION || "v1").trim().toLowerCase()
if (encryptionVersion !== "v1" && encryptionVersion !== "v2") {
  console.error("[validate-env] APP_SECRETS_ENCRYPTION_VERSION must be v1 or v2")
  process.exit(1)
}

const previousEncryptionKey = String(process.env.APP_SECRETS_ENCRYPTION_KEY_PREVIOUS || "").trim()
if (previousEncryptionKey) {
  assertStrongSecret("APP_SECRETS_ENCRYPTION_KEY_PREVIOUS", previousEncryptionKey)
  if (previousEncryptionKey === encryptionKey) {
    console.error("[validate-env] APP_SECRETS_ENCRYPTION_KEY_PREVIOUS must differ from the current key")
    process.exit(1)
  }
}

const developerPepper = String(process.env.DEVELOPER_API_KEY_PEPPER || "").trim()
const previousDeveloperPepper = String(process.env.DEVELOPER_API_KEY_PEPPER_PREVIOUS || "").trim()
if (developerPepper) assertStrongSecret("DEVELOPER_API_KEY_PEPPER", developerPepper)
if (previousDeveloperPepper) {
  assertStrongSecret("DEVELOPER_API_KEY_PEPPER_PREVIOUS", previousDeveloperPepper)
  if (!developerPepper) {
    console.error("[validate-env] DEVELOPER_API_KEY_PEPPER_PREVIOUS requires DEVELOPER_API_KEY_PEPPER")
    process.exit(1)
  }
  if (previousDeveloperPepper === developerPepper) {
    console.error("[validate-env] DEVELOPER_API_KEY_PEPPER_PREVIOUS must differ from the current pepper")
    process.exit(1)
  }
}
if (!developerPepper) {
  console.warn("[validate-env] DEVELOPER_API_KEY_PEPPER is not set; Developer API HMACs use the legacy server-secret fallback")
}


assertCredentialPair("INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET")

if (channel === "review_phase_1") {
  const missingReview = getMissing(reviewPhase1Required)
  if (missingReview.length > 0) {
    failList("[validate-env] review_phase_1 deployment is missing required environment variables:", missingReview)
  }

}

console.log(`[validate-env] OK for channel: ${channel}; credential encryption writes: ${encryptionVersion}`)
