const MAX_STRING_LENGTH = 4_000
const MAX_ARRAY_ITEMS = 50
const MAX_OBJECT_ENTRIES = 80
const MAX_DEPTH = 5
const SECRET_KEY_PATTERN = /(access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|authorization|client[_-]?secret|app[_-]?secret|service[_-]?role|password|secret|credential)/i
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

function redactString(value: string): string {
  let output = value
  for (const key of QUERY_SECRET_KEYS) {
    output = output.replace(
      new RegExp(`([?&]${key}=)[^&#\\s]+`, "gi"),
      `$1[REDACTED]`,
    )
    output = output.replace(
      new RegExp(`\\b(${key}=)[^\\s&]+`, "gi"),
      `$1[REDACTED]`,
    )
  }
  return output.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
}

function redactSensitiveValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "string") return redactString(value)
  if (depth > MAX_DEPTH) return "[REDACTED_DEPTH]"

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => redactSensitiveValue(entry, depth + 1))
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_OBJECT_ENTRIES)
        .map(([key, entry]) => [
          key,
          SECRET_KEY_PATTERN.test(key)
            ? "[REDACTED]"
            : redactSensitiveValue(entry, depth + 1),
        ]),
    )
  }
  return "[REDACTED]"
}

function boundTimelineValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value
  }
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH)
  if (depth >= MAX_DEPTH) return "[TRUNCATED_DEPTH]"

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => boundTimelineValue(entry, depth + 1))
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_OBJECT_ENTRIES)
        .map(([key, entry]) => [key, boundTimelineValue(entry, depth + 1)]),
    )
  }

  return String(value).slice(0, MAX_STRING_LENGTH)
}

/** Redacts credentials first, then bounds the audit payload for safe storage. */
export function redactAutomationTimelineValue(value: unknown): unknown {
  return boundTimelineValue(redactSensitiveValue(value))
}

export function redactAutomationTimelineRecord(value: unknown): Record<string, unknown> {
  const redacted = redactAutomationTimelineValue(value)
  return redacted && typeof redacted === "object" && !Array.isArray(redacted)
    ? redacted as Record<string, unknown>
    : { value: redacted }
}
