const QUERY_SECRET_KEYS = [
  "access_token",
  "input_token",
  "refresh_token",
  "id_token",
  "api_key",
  "apikey",
  "authorization",
  "client_secret",
  "app_secret",
  "appsecret_proof",
  "service_role",
  "password",
  "secret",
  "token",
  "code",
]

const OBJECT_SECRET_KEY_PATTERN = /(access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|authorization|client[_-]?secret|app[_-]?secret|service[_-]?role|password|secret|credential)/i

export function redactSensitiveString(value: string): string {
  let output = value

  for (const key of QUERY_SECRET_KEYS) {
    const queryPattern = new RegExp(`([?&]${key}=)[^&#\\s]+`, "gi")
    output = output.replace(queryPattern, `$1[REDACTED]`)
    const assignmentPattern = new RegExp(`\\b(${key}=)[^\\s&]+`, "gi")
    output = output.replace(assignmentPattern, `$1[REDACTED]`)
  }

  output = output.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
  output = output.replace(/\b(sf_live_[A-Za-z0-9_-]{16})_[A-Za-z0-9_-]{16,}\b/g, "$1_[REDACTED]")
  output = output.replace(/\b(sf_oauth_(?:access|refresh)\.)[A-Za-z0-9_.-]+\b/g, "$1[REDACTED]")
  output = output.replace(/\b(sb_(?:secret|publishable)_[A-Za-z0-9_-]{16,})\b/g, "[REDACTED]")
  output = output.replace(/\b(sk-[A-Za-z0-9_-]{16,})\b/g, "[REDACTED]")

  return output
}

export function redactSensitiveLogValue(value: unknown, depth = 0): unknown {
  if (value == null) return value
  if (typeof value === "string") return redactSensitiveString(value)
  if (typeof value === "number" || typeof value === "boolean") return value
  if (depth > 4) return "[REDACTED_DEPTH]"

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveString(value.message),
      stack: value.stack ? redactSensitiveString(value.stack).split("\n").slice(0, 8).join("\n") : undefined,
    }
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactSensitiveLogValue(item, depth + 1))
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      output[key] = OBJECT_SECRET_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : redactSensitiveLogValue(entry, depth + 1)
    }
    return output
  }

  return "[REDACTED]"
}
