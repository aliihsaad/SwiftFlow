import { Pool, type PoolConfig } from "pg"

export interface PostgresRuntimeEnvironment extends Readonly<Record<string, string | undefined>> {
  DATABASE_URL?: string
  POSTGRES_POOL_MAX?: string
  POSTGRES_IDLE_TIMEOUT_MS?: string
  POSTGRES_CONNECTION_TIMEOUT_MS?: string
  POSTGRES_SSL_MODE?: string
  POSTGRES_SSL_REJECT_UNAUTHORIZED?: string
}

function boundedPositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback
}

export function buildPostgresPoolConfig(
  environment: PostgresRuntimeEnvironment = process.env,
): PoolConfig {
  const connectionString = environment.DATABASE_URL?.trim()
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the PostgreSQL worker runtime")
  }

  const sslMode = environment.POSTGRES_SSL_MODE?.trim().toLowerCase()
  const ssl = sslMode === "require"
    ? {
        rejectUnauthorized:
          environment.POSTGRES_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !== "false",
      }
    : undefined

  return {
    connectionString,
    application_name: "swiftflow-webhook-worker",
    max: boundedPositiveInteger(environment.POSTGRES_POOL_MAX, 10, 50),
    idleTimeoutMillis: boundedPositiveInteger(
      environment.POSTGRES_IDLE_TIMEOUT_MS,
      30_000,
      10 * 60_000,
    ),
    connectionTimeoutMillis: boundedPositiveInteger(
      environment.POSTGRES_CONNECTION_TIMEOUT_MS,
      10_000,
      2 * 60_000,
    ),
    ssl,
  }
}

export function createPostgresPool(
  environment: PostgresRuntimeEnvironment = process.env,
): Pool {
  const pool = new Pool(buildPostgresPoolConfig(environment))

  pool.on("error", (error) => {
    console.error("[POSTGRES] Unexpected idle client error", {
      message: error.message,
    })
  })

  return pool
}
