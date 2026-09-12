import { existsSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const skipDatabase = args.includes("--skip-db")
const projectRefIndex = args.indexOf("--project-ref")
const explicitProjectRef = projectRefIndex >= 0 ? args[projectRefIndex + 1] : ""
const linkedRefPath = "supabase/.temp/project-ref"
const linkedProjectRef = existsSync(linkedRefPath)
  ? readFileSync(linkedRefPath, "utf8").trim()
  : ""
const projectRef = String(explicitProjectRef || linkedProjectRef).trim()

if (!/^[a-z0-9]+$/.test(projectRef)) {
  console.error("[setup:supabase] Missing a valid linked Supabase project ref.")
  console.error("Run: supabase link --project-ref <project-ref>")
  process.exit(1)
}

const normalFunctions = [
  "generate-reply",
  "generate-message-reply",
  "sync-analytics",
  "sync-comments",
  "sync-messages",
  "process-automations",
  "automation-orchestrator",
  "scheduler-tick",
]

const internalFunctions = [
  "process-scheduled-executions",
  "automation-worker-run",
  "automation-worker-ai-response",
  "automation-worker-condition",
  "automation-worker-http-request",
  "automation-worker-private-reply",
  "automation-worker-reply-comment",
  "automation-worker-send-dm",
  "automation-worker-send-email",
  "automation-worker-telegram",
  "telegram-automation-webhook",
  "retention-cleanup",
  "token-health-sweep",
  "instagram-token-refresh",
]

function runSupabase(commandArgs) {
  console.log(`> supabase ${commandArgs.join(" ")}`)
  if (dryRun) return

  const result = spawnSync("supabase", commandArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
  })
  if (result.error) {
    console.error(`[setup:supabase] ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status || 1)
}

console.log(`[setup:supabase] Target project: ${projectRef}`)
if (dryRun) console.log("[setup:supabase] Dry run; no remote resource will be changed.")

if (!skipDatabase) runSupabase(["db", "push", "--linked"])

for (const functionName of normalFunctions) {
  runSupabase(["functions", "deploy", functionName, "--project-ref", projectRef])
}
for (const functionName of internalFunctions) {
  runSupabase([
    "functions",
    "deploy",
    functionName,
    "--project-ref",
    projectRef,
    "--no-verify-jwt",
  ])
}

console.log(`[setup:supabase] ${dryRun ? "Plan complete" : "Deployment complete"}: ${normalFunctions.length + internalFunctions.length} Edge Functions.`)
