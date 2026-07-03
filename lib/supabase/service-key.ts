export function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || undefined
}

export function requireSupabaseServiceRoleKey(): string {
  const serviceKey = getSupabaseServiceRoleKey()
  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY env variable")
  }
  return serviceKey
}

export function looksLikeSupabaseJwt(value: string | null | undefined): boolean {
  const normalized = String(value || "").trim()
  return normalized.startsWith("eyJ") && normalized.split(".").length === 3
}

export function buildSupabaseFunctionHeaders(
  serviceKey = requireSupabaseServiceRoleKey(),
): Record<string, string> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null
  const authJwt = looksLikeSupabaseJwt(serviceKey)
    ? serviceKey
    : (looksLikeSupabaseJwt(anonKey) ? anonKey : null)

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: serviceKey,
  }

  if (authJwt) {
    headers.Authorization = `Bearer ${authJwt}`
  }

  return headers
}
