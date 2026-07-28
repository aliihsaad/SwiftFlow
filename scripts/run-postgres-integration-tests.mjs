import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url))
const composeFile = fileURLToPath(
  new URL("../compose.postgres-test.yaml", import.meta.url),
)
const workerComposeFile = fileURLToPath(
  new URL("../compose.webhook-comparison.yaml", import.meta.url),
)
const vitestCli = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
)
const composeProject = "swiftflow-webhook-test"
const workerComposeProject = "swiftflow-webhook-service-smoke"
const workerImage = "swiftflow/webhook-comparison:test"

function resolveTestPort(value) {
  if (value === undefined || value === "") return 55_432
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error("SWIFTFLOW_TEST_POSTGRES_PORT must be an integer from 1024 to 65535")
  }
  return port
}

async function run(command, args, options = {}) {
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: options.env || process.env,
      stdio: "inherit",
      windowsHide: true,
    })
    child.once("error", reject)
    child.once("exit", (code) => resolveExit(code ?? 1))
  })

  if (exitCode !== 0 && options.allowFailure !== true) {
    throw new Error(`${command} exited with code ${exitCode}`)
  }
  return exitCode
}

const port = resolveTestPort(process.env.SWIFTFLOW_TEST_POSTGRES_PORT)
const databaseUrl =
  `postgresql://swiftflow_test:swiftflow_test@127.0.0.1:${port}/swiftflow_test`
const workerDatabaseUrl =
  `postgresql://swiftflow_comparison_test:swiftflow_comparison_test@127.0.0.1:${port}/swiftflow_test`
const ingressDatabaseUrl =
  `postgresql://swiftflow_ingress_test:swiftflow_ingress_test@127.0.0.1:${port}/swiftflow_test`
const containerWorkerDatabaseUrl =
  "postgresql://swiftflow_comparison_test:swiftflow_comparison_test@postgres:5432/swiftflow_test"
const hostGatewayWorkerDatabaseUrl =
  `postgresql://swiftflow_comparison_test:swiftflow_comparison_test@host.docker.internal:${port}/swiftflow_test`
const composeArgs = [
  "compose",
  "-p",
  composeProject,
  "-f",
  composeFile,
]
const workerComposeArgs = [
  "compose",
  "-p",
  workerComposeProject,
  "-f",
  workerComposeFile,
]

const testEnvironment = {
  ...process.env,
  SWIFTFLOW_TEST_POSTGRES_PORT: String(port),
  SWIFTFLOW_WEBHOOK_COMPARISON_IMAGE: workerImage,
  DATABASE_URL: workerDatabaseUrl,
  WEBHOOK_COMPARISON_DATABASE_URL: hostGatewayWorkerDatabaseUrl,
  WEBHOOK_COMPARISON_WORKER_ID: "postgres-integration-smoke",
  WEBHOOK_COMPARISON_RUN_ONCE: "true",
  SWIFTFLOW_TEST_DATABASE_URL: databaseUrl,
  SWIFTFLOW_TEST_WORKER_DATABASE_URL: workerDatabaseUrl,
  SWIFTFLOW_TEST_INGRESS_DATABASE_URL: ingressDatabaseUrl,
  SWIFTFLOW_TEST_EXECUTOR_DATABASE_URL:
    `postgresql://swiftflow_executor_test:swiftflow_executor_test@127.0.0.1:${port}/swiftflow_test`,
}

const workerContainerArgs = [
  "--rm",
  "--init",
  "--read-only",
  "--tmpfs",
  "/tmp:rw,noexec,nosuid,nodev,size=16777216",
  "--cap-drop",
  "ALL",
  "--security-opt",
  "no-new-privileges",
  "--network",
  `${composeProject}_default`,
  "--env",
  `DATABASE_URL=${containerWorkerDatabaseUrl}`,
  "--env",
  "POSTGRES_CONNECTION_TIMEOUT_MS=5000",
  "--env",
  "WEBHOOK_COMPARISON_WORKER_ID=postgres-container-smoke",
  "--env",
  "WEBHOOK_COMPARISON_RUN_ONCE=true",
]

let primaryError
try {
  await run("docker", [...composeArgs, "up", "-d", "--wait", "--remove-orphans"], {
    env: testEnvironment,
  })
  await run(process.execPath, [
    vitestCli,
    "run",
    "--config",
    "vitest.postgres.config.ts",
  ], { env: testEnvironment })
  await run("docker", [
    ...composeArgs,
    "exec",
    "-T",
    "--env",
    "PGPASSWORD=swiftflow_comparison_test",
    "postgres",
    "psql",
    "--no-psqlrc",
    "--host",
    "127.0.0.1",
    "--username",
    "swiftflow_comparison_test",
    "--dbname",
    "swiftflow_test",
    "--file",
    "/opt/swiftflow/verify-webhook-comparison-role.sql",
  ], { env: testEnvironment })
  await run("docker", [
    ...composeArgs,
    "exec",
    "-T",
    "--env",
    "PGPASSWORD=swiftflow_ingress_test",
    "postgres",
    "psql",
    "--no-psqlrc",
    "--host",
    "127.0.0.1",
    "--username",
    "swiftflow_ingress_test",
    "--dbname",
    "swiftflow_test",
    "--file",
    "/opt/swiftflow/verify-webhook-ingress-role.sql",
  ], { env: testEnvironment })
  await run("docker", [
    ...composeArgs,
    "exec",
    "-T",
    "--env",
    "PGPASSWORD=swiftflow_executor_test",
    "postgres",
    "psql",
    "--no-psqlrc",
    "--host",
    "127.0.0.1",
    "--username",
    "swiftflow_executor_test",
    "--dbname",
    "swiftflow_test",
    "--file",
    "/opt/swiftflow/verify-action-executor-role.sql",
  ], { env: testEnvironment })
  await run("docker", [
    "build",
    "--file",
    "Dockerfile.webhook-comparison",
    "--tag",
    workerImage,
    ".",
  ], { env: testEnvironment })
  await run("docker", [
    "run",
    ...workerContainerArgs,
    workerImage,
    "workers/comment-comparison-healthcheck.ts",
  ], { env: testEnvironment })
  await run("docker", [
    "run",
    ...workerContainerArgs,
    workerImage,
  ], { env: testEnvironment })
  await run("docker", [
    ...workerComposeArgs,
    "up",
    "--detach",
    "--no-build",
    "--wait",
    "--wait-timeout",
    "60",
  ], { env: testEnvironment })
} catch (error) {
  primaryError = error
} finally {
  await run("docker", [
    ...workerComposeArgs,
    "down",
    "--remove-orphans",
  ], {
    env: testEnvironment,
    allowFailure: true,
  })
  await run("docker", [
    ...composeArgs,
    "down",
    "--volumes",
    "--remove-orphans",
  ], {
    env: testEnvironment,
    allowFailure: true,
  })
}

if (primaryError) throw primaryError
