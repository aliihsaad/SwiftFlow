import "server-only"

import { createAdminClient } from "@/utils/supabase/admin"

/**
 * Persistence for the Developer API OAuth connector: the registered-client
 * allowlist that /authorize matches redirect_uri against, and the redeemed
 * authorization codes that make a code single-use.
 *
 * Both tables are service_role only, so every call here goes through the admin
 * client. These routes are unauthenticated by design (OAuth endpoints), which
 * is exactly why the redirect_uri allowlist matters.
 */

export interface DeveloperOAuthClient {
  clientId: string
  clientName: string | null
  redirectUris: string[]
  scope: string | null
}

/** A redirect_uri is only usable if it is HTTPS and carries no fragment. */
export function isAcceptableRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.hash
  } catch {
    return false
  }
}

export async function registerDeveloperOAuthClient(input: {
  clientId: string
  clientName: string | null
  redirectUris: string[]
  scope: string | null
}): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from("developer_oauth_clients").insert({
    client_id: input.clientId,
    client_name: input.clientName,
    redirect_uris: input.redirectUris,
    scope: input.scope,
  })
  if (error) throw new Error(`Failed to register OAuth client: ${error.message}`)
}

export async function getDeveloperOAuthClient(clientId: string): Promise<DeveloperOAuthClient | null> {
  if (!clientId) return null
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("developer_oauth_clients")
    .select("client_id, client_name, redirect_uris, scope")
    .eq("client_id", clientId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load OAuth client: ${error.message}`)
  if (!data) return null

  return {
    clientId: data.client_id as string,
    clientName: (data.client_name as string | null) ?? null,
    redirectUris: (data.redirect_uris as string[] | null) ?? [],
    scope: (data.scope as string | null) ?? null,
  }
}

/**
 * Exact string comparison against the registered set. Deliberately no
 * normalization, prefix matching or wildcards — those are what make
 * redirect_uri validation bypassable.
 */
export function isRegisteredRedirectUri(client: DeveloperOAuthClient, redirectUri: string): boolean {
  return client.redirectUris.some((registered) => registered === redirectUri)
}

/**
 * Marks an authorization code as redeemed. Returns false when the code was
 * already redeemed, which the token endpoint treats as invalid_grant.
 *
 * The primary key on jti makes this atomic: a concurrent second redemption
 * loses the insert rather than both succeeding.
 */
export async function claimDeveloperOAuthCode(input: {
  jti: string
  clientId: string
  expiresAt: Date
}): Promise<boolean> {
  const supabase = createAdminClient()
  const { error } = await supabase.from("developer_oauth_used_codes").insert({
    jti: input.jti,
    client_id: input.clientId,
    expires_at: input.expiresAt.toISOString(),
  })

  if (!error) return true
  // 23505 = unique_violation: the code has already been redeemed.
  if (error.code === "23505") return false
  throw new Error(`Failed to record authorization code redemption: ${error.message}`)
}
