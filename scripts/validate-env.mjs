const channel = String(process.env.APP_RELEASE_CHANNEL || process.env.NEXT_PUBLIC_APP_RELEASE_CHANNEL || "production_full").trim()

const sharedRequired = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
]

const reviewPhase1Required = [
  "NEXT_PUBLIC_META_APP_ID",
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "APP_SECRETS_ENCRYPTION_KEY",
]

function getMissing(keys) {
  return keys.filter((key) => !String(process.env[key] || "").trim())
}

const missingShared = getMissing(sharedRequired)
if (missingShared.length > 0) {
  console.error("[validate-env] Missing required environment variables:")
  for (const key of missingShared) {
    console.error(`- ${key}`)
  }
  process.exit(1)
}

if (channel === "review_phase_1") {
  const missingReview = getMissing(reviewPhase1Required)
  if (!String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim()) {
    missingReview.push("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY")
  }
  if (missingReview.length > 0) {
    console.error("[validate-env] review_phase_1 deployment is missing required environment variables:")
    for (const key of missingReview) {
      console.error(`- ${key}`)
    }
    process.exit(1)
  }

  if (String(process.env.META_OAUTH_SCOPE_PROFILE || "").trim() !== "review_phase_1") {
    console.error("[validate-env] review_phase_1 deployment must set META_OAUTH_SCOPE_PROFILE=review_phase_1")
    process.exit(1)
  }
}

console.log(`[validate-env] OK for channel: ${channel}`)
