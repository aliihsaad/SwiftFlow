import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { parse as parseDotenv } from "dotenv"

export const REQUIRED_APP_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "APP_SECRETS_ENCRYPTION_KEY",
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
]

export const REQUIRED_ENV_ALTERNATIVES = [
  ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"],
]

export const REQUIRED_FUNCTIONS = [
  "generate-reply",
  "generate-message-reply",
  "sync-analytics",
  "sync-comments",
  "sync-messages",
  "process-automations",
  "process-scheduled-executions",
  "automation-orchestrator",
  "automation-worker-run",
  "automation-worker-ai-response",
  "automation-worker-condition",
  "automation-worker-http-request",
  "automation-worker-private-reply",
  "automation-worker-reply-comment",
  "automation-worker-send-dm",
  "automation-worker-telegram",
  "telegram-automation-webhook",
  "scheduler-tick",
  "retention-cleanup",
  "token-health-sweep",
  "instagram-token-refresh",
]

export const REQUIRED_SUPABASE_SECRETS = [
  "APP_SECRETS_ENCRYPTION_KEY",
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
]

const PLACEHOLDER_PATTERN = /(^|[-_.])(change|replace|todo|your|xxxxx)([-_.]|$)|\.\.\.|<[^>]+>/i

export function isConfiguredValue(value) {
  const normalized = String(value || "").trim()
  return normalized.length > 0 && !PLACEHOLDER_PATTERN.test(normalized)
}

export function findMissingEnv(env, exact = REQUIRED_APP_ENV, alternatives = REQUIRED_ENV_ALTERNATIVES) {
  const missing = exact.filter((key) => !isConfiguredValue(env[key]))
  for (const group of alternatives) {
    if (!group.some((key) => isConfiguredValue(env[key]))) {
      missing.push(`one of ${group.join(" / ")}`)
    }
  }
  return missing
}

export function parseJsonOutput(raw) {
  const text = String(raw || "").trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    const starts = [text.indexOf("["), text.indexOf("{")].filter((index) => index >= 0)
    if (starts.length === 0) return null
    try {
      return JSON.parse(text.slice(Math.min(...starts)))
    } catch {
      return null
    }
  }
}

export function extractVercelEnvNames(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.envs) ? payload.envs : []
  return new Set(rows.map((row) => row?.key).filter((key) => typeof key === "string"))
}

export function extractSupabaseProjectRefs(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.projects) ? payload.projects : []
  return new Map(rows.flatMap((row) => {
    const ref = row?.ref || row?.id
    return typeof ref === "string" ? [[ref, row]] : []
  }))
}

export function extractFunctionNames(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.functions) ? payload.functions : []
  return new Set(rows.map((row) => row?.slug || row?.name).filter((name) => typeof name === "string"))
}

export function extractSecretNames(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.secrets) ? payload.secrets : []
  return new Set(rows.map((row) => row?.name || row?.key).filter((name) => typeof name === "string"))
}

export function extractMigrationVersions(fileNames) {
  return fileNames.flatMap((fileName) => {
    const match = /^(\d{14})_[a-z0-9_]+\.sql$/i.exec(fileName)
    return match ? [match[1]] : []
  })
}

export function buildManualMetaUrls(appUrl) {
  const base = String(appUrl || "").trim().replace(/\/+$/, "")
  if (!base) return null
  return {
    oauthCallback: `${base}/api/auth/instagram/callback`,
    webhookCallback: `${base}/api/webhooks/instagram`,
  }
}

export function supabaseRefFromUrl(value) {
  try {
    const host = new URL(String(value || "")).hostname
    const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(host)
    return match?.[1] || null
  } catch {
    return null
  }
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return parseDotenv(fs.readFileSync(filePath))
}

function redact(text, secrets) {
  let safe = String(text || "")
  for (const secret of secrets) {
    if (secret && secret.length >= 6) safe = safe.split(secret).join("[redacted]")
  }
  return safe.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, "$1[redacted]@")
}

function run(command, args, secrets = []) {
  const executable = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : command
  const executableArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", [command, ...args].map(quoteWindowsArgument).join(" ")]
    : args
  const result = spawnSync(executable, executableArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NO_COLOR: "1" },
  })
  return {
    ok: result.status === 0,
    stdout: redact(result.stdout, secrets),
    stderr: redact(result.stderr || result.error?.message, secrets),
  }
}

function quoteWindowsArgument(value) {
  const normalized = String(value)
  if (/^[a-z0-9_./:=+-]+$/i.test(normalized)) return normalized
  return `"${normalized.replace(/"/g, '\\"')}"`
}

function missingNames(names, required, alternatives = []) {
  const missing = required.filter((key) => !names.has(key))
  for (const group of alternatives) {
    if (!group.some((key) => names.has(key))) missing.push(`one of ${group.join(" / ")}`)
  }
  return missing
}

function shortError(result) {
  const message = String(result.stderr || result.stdout || "command failed")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  return message || "command failed"
}

async function verifyDatabase({ projectRef, localMigrationVersions, report, secrets }) {
  const connectionString = String(process.env.SUPABASE_DB_URL || "").trim()
  const password = String(process.env.SUPABASE_DB_PASSWORD || "").trim()
  if (!connectionString && !password) {
    report("SKIP", "Database migrations and scheduler", "Set SUPABASE_DB_PASSWORD temporarily to enable read-only verification")
    return
  }

  let client
  try {
    const { Client } = await import("pg")
    client = new Client(connectionString ? {
      connectionString,
      ssl: { rejectUnauthorized: false },
      statement_timeout: 10_000,
    } : {
      host: `db.${projectRef}.supabase.co`,
      port: 5432,
      user: "postgres",
      password,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      statement_timeout: 10_000,
    })
    await client.connect()
    await client.query("begin read only")

    const migrations = await client.query("select version from supabase_migrations.schema_migrations order by version")
    const remoteVersions = new Set(migrations.rows.map((row) => String(row.version)))
    const missingMigrations = localMigrationVersions.filter((version) => !remoteVersions.has(version))
    if (missingMigrations.length === 0) {
      report("PASS", "Database migrations", `${localMigrationVersions.length} local migrations are recorded remotely`)
    } else {
      report("FAIL", "Database migrations", `${missingMigrations.length} local migration(s) are not recorded remotely`)
    }

    const jobs = await client.query("select jobname, schedule, active, command from cron.job where active = true")
    const scheduler = jobs.rows.find((row) => String(row.command || "").includes("scheduler-tick"))
    if (scheduler && String(scheduler.schedule).trim() === "* * * * *") {
      report("PASS", "Automation scheduler", "scheduler-tick is active every minute")
    } else {
      report("FAIL", "Automation scheduler", "No active one-minute scheduler-tick cron job was found")
    }
    await client.query("rollback")
  } catch (error) {
    report("FAIL", "Database verification", redact(error instanceof Error ? error.message : error, secrets))
  } finally {
    await client?.end().catch(() => undefined)
  }
}

export async function main() {
  const root = process.cwd()
  const localEnv = {
    ...readEnvFile(path.join(root, ".env.local")),
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === "string")),
  }
  const secrets = [
    localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    localEnv.SUPABASE_SERVICE_ROLE_KEY,
    localEnv.SUPABASE_SERVICE_KEY,
    localEnv.APP_SECRETS_ENCRYPTION_KEY,
    localEnv.INSTAGRAM_APP_SECRET,
    localEnv.META_WEBHOOK_VERIFY_TOKEN,
    process.env.SUPABASE_DB_PASSWORD,
    process.env.SUPABASE_DB_URL,
  ].filter(Boolean)

  const counts = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0, INFO: 0 }
  const report = (status, label, detail = "") => {
    counts[status] += 1
    console.log(`[${status}] ${label}${detail ? ` — ${detail}` : ""}`)
  }

  console.log("SwiftFlow managed setup preflight (read only)\n")

  const localMissing = findMissingEnv(localEnv)
  if (localMissing.length === 0) report("PASS", "Local environment", "required variable names are configured")
  else report("FAIL", "Local environment", `missing or placeholder: ${localMissing.join(", ")}`)

  const projectRefPath = path.join(root, "supabase", ".temp", "project-ref")
  const projectRef = fs.existsSync(projectRefPath) ? fs.readFileSync(projectRefPath, "utf8").trim() : ""
  if (/^[a-z0-9]{20}$/i.test(projectRef)) report("PASS", "Local Supabase link", `project ref ${projectRef}`)
  else report("FAIL", "Local Supabase link", "run: supabase link --project-ref <project-ref>")

  const localUrlRef = supabaseRefFromUrl(localEnv.NEXT_PUBLIC_SUPABASE_URL)
  if (projectRef && localUrlRef === projectRef) report("PASS", "Supabase URL/link alignment")
  else if (projectRef && localUrlRef) report("FAIL", "Supabase URL/link alignment", "NEXT_PUBLIC_SUPABASE_URL targets a different project")

  const vercelLinkPath = path.join(root, ".vercel", "project.json")
  let vercelProject = null
  try {
    vercelProject = JSON.parse(fs.readFileSync(vercelLinkPath, "utf8"))
  } catch {
    // Reported below.
  }
  if (vercelProject?.projectId && vercelProject?.orgId) report("PASS", "Local Vercel link", vercelProject.projectName || "linked")
  else report("FAIL", "Local Vercel link", "run: vercel link")

  const supabaseVersion = run("supabase", ["--version"], secrets)
  if (supabaseVersion.ok) report("PASS", "Supabase CLI", supabaseVersion.stdout.trim())
  else report("FAIL", "Supabase CLI", "install the Supabase CLI")

  let supabaseProjectAccessible = false
  if (supabaseVersion.ok) {
    const projectsResult = run("supabase", ["projects", "list", "--output", "json"], secrets)
    const projects = extractSupabaseProjectRefs(parseJsonOutput(projectsResult.stdout))
    const linkedProject = projectRef ? projects.get(projectRef) : null
    if (!projectsResult.ok) {
      report("FAIL", "Supabase login", `${shortError(projectsResult)}; run: supabase logout, then supabase login`)
    } else if (!linkedProject) {
      report("FAIL", "Supabase project access", `the logged-in account cannot access linked ref ${projectRef || "(missing)"}; log in with the project owner account`)
    } else if (linkedProject.status && linkedProject.status !== "ACTIVE_HEALTHY") {
      report("FAIL", "Supabase project health", String(linkedProject.status))
    } else {
      supabaseProjectAccessible = true
      report("PASS", "Supabase login and project access", linkedProject.name || projectRef)
    }
  }

  const vercelVersion = run("vercel", ["--version"], secrets)
  if (vercelVersion.ok) report("PASS", "Vercel CLI", vercelVersion.stdout.trim())
  else report("FAIL", "Vercel CLI", "install the Vercel CLI")

  let vercelReady = false
  if (vercelVersion.ok) {
    const whoami = run("vercel", ["whoami", "--no-color"], secrets)
    if (whoami.ok) report("PASS", "Vercel login", whoami.stdout.trim())
    else report("FAIL", "Vercel login", "run: vercel login")

    const inspect = run("vercel", ["project", "inspect", "--yes", "--no-color"], secrets)
    if (inspect.ok) report("PASS", "Vercel project access")
    else report("FAIL", "Vercel project access", shortError(inspect))

    const envResult = run("vercel", ["env", "ls", "production", "--format", "json", "--no-color"], secrets)
    const envNames = extractVercelEnvNames(parseJsonOutput(envResult.stdout))
    const missing = missingNames(envNames, REQUIRED_APP_ENV, REQUIRED_ENV_ALTERNATIVES)
    if (!envResult.ok) report("FAIL", "Vercel production environment", shortError(envResult))
    else if (missing.length > 0) report("FAIL", "Vercel production environment", `missing: ${missing.join(", ")}`)
    else {
      vercelReady = true
      report("PASS", "Vercel production environment", "required variable names are present")
    }
  }

  const localFunctionNames = new Set(
    fs.existsSync(path.join(root, "supabase", "functions"))
      ? fs.readdirSync(path.join(root, "supabase", "functions"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
      : [],
  )
  const missingLocalFunctions = REQUIRED_FUNCTIONS.filter((name) => !localFunctionNames.has(name))
  if (missingLocalFunctions.length === 0) report("PASS", "Local Edge Functions", `${REQUIRED_FUNCTIONS.length} required functions found`)
  else report("FAIL", "Local Edge Functions", `missing: ${missingLocalFunctions.join(", ")}`)

  if (supabaseProjectAccessible) {
    const functionsResult = run("supabase", ["functions", "list", "--project-ref", projectRef, "--output", "json"], secrets)
    const remoteFunctions = extractFunctionNames(parseJsonOutput(functionsResult.stdout))
    const missingFunctions = REQUIRED_FUNCTIONS.filter((name) => !remoteFunctions.has(name))
    if (!functionsResult.ok) report("FAIL", "Deployed Edge Functions", shortError(functionsResult))
    else if (missingFunctions.length > 0) report("FAIL", "Deployed Edge Functions", `missing: ${missingFunctions.join(", ")}`)
    else report("PASS", "Deployed Edge Functions", `${REQUIRED_FUNCTIONS.length} required functions found`)

    const secretsResult = run("supabase", ["secrets", "list", "--project-ref", projectRef, "--output", "json"], secrets)
    const remoteSecrets = extractSecretNames(parseJsonOutput(secretsResult.stdout))
    const missingSecrets = REQUIRED_SUPABASE_SECRETS.filter((name) => !remoteSecrets.has(name))
    if (!secretsResult.ok) report("FAIL", "Supabase Function secrets", shortError(secretsResult))
    else if (missingSecrets.length > 0) report("FAIL", "Supabase Function secrets", `missing names: ${missingSecrets.join(", ")}`)
    else report("PASS", "Supabase Function secrets", "required secret names are present")
  } else {
    report("SKIP", "Deployed Edge Functions", "fix Supabase project access first")
    report("SKIP", "Supabase Function secrets", "fix Supabase project access first")
  }

  const migrationDir = path.join(root, "supabase", "migrations")
  const migrationFiles = fs.existsSync(migrationDir) ? fs.readdirSync(migrationDir) : []
  const localMigrationVersions = extractMigrationVersions(migrationFiles)
  if (localMigrationVersions.length > 0) report("PASS", "Local migration chain", `${localMigrationVersions.length} timestamped migrations found`)
  else report("FAIL", "Local migration chain", "no timestamped SQL migrations found")

  if (projectRef && supabaseProjectAccessible) {
    await verifyDatabase({ projectRef, localMigrationVersions, report, secrets })
  } else {
    report("SKIP", "Database migrations and scheduler", "fix Supabase project access first")
  }

  const metaUrls = buildManualMetaUrls(localEnv.NEXT_PUBLIC_APP_URL)
  if (metaUrls) {
    let appHost = ""
    try {
      appHost = new URL(localEnv.NEXT_PUBLIC_APP_URL).hostname
    } catch {
      report("FAIL", "NEXT_PUBLIC_APP_URL", "must be an absolute http(s) URL")
    }
    if (appHost === "localhost" || appHost === "127.0.0.1") {
      report("WARN", "Production Meta callback URLs", "local NEXT_PUBLIC_APP_URL is localhost; confirm the production Vercel URL manually")
    }
    report("INFO", "Meta OAuth callback derived from local config", metaUrls.oauthCallback)
    report("INFO", "Meta webhook callback derived from local config", metaUrls.webhookCallback)
  } else {
    report("WARN", "Manual Meta callback URLs", "configure NEXT_PUBLIC_APP_URL first")
  }

  console.log(`\nSummary: ${counts.PASS} passed, ${counts.FAIL} failed, ${counts.WARN} warning(s), ${counts.SKIP} skipped.`)
  console.log("No files, secrets, databases, or deployments were changed.")
  if (vercelReady && counts.FAIL === 0) console.log("Managed setup preflight passed.")
  process.exitCode = counts.FAIL > 0 ? 1 : 0
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ""
if (import.meta.url === invokedPath) {
  await main()
}
