// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck - Deno runtime
/**
 * Token Health Sweep (internal-only)
 *
 * Runs ~daily per account (invoked hourly by scheduler-tick; each account is
 * rechecked once its last check is >20h old). For every connected social
 * account it calls Meta's debug_token with the app token and records:
 *   - real token expiry (social_accounts.token_expires_at)
 *   - metadata.token_health: valid | expiring_soon | invalid
 *   - metadata.token_checked_at
 *   - re-synced granted scopes (so permission drift after the user edits
 *     Facebook settings is picked up without a reconnect)
 *
 * Read-only towards Meta; never deletes accounts. Invalid tokens surface as
 * metadata so the UI can prompt a reconnect.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { assertInternalInvoke } from "../_shared/internal-auth.ts"
import { decryptMetaToken } from "../_shared/meta-account.ts"
import { META_GRAPH_API_BASE_URL } from "../_shared/meta-graph.ts"
import { redactSensitiveLogValue } from "../_shared/log-redaction.ts"
import { isTokenCheckDue, resolveTokenHealth } from "../_shared/token-health.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const MAX_ACCOUNTS_PER_RUN = 50

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const unauthorized = assertInternalInvoke(req, corsHeaders)
  if (unauthorized) return unauthorized

  const appId = Deno.env.get("META_APP_ID") || Deno.env.get("NEXT_PUBLIC_META_APP_ID") || ""
  const appSecret = Deno.env.get("META_APP_SECRET") || ""
  if (!appId || !appSecret) {
    return json({ success: false, error: "Missing META_APP_ID / META_APP_SECRET function secrets" }, 500)
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  try {
    const { data: accounts, error } = await supabase
      .from("social_accounts")
      .select("id, workspace_id, platform, account_name, access_token, metadata")
      .in("platform", ["facebook", "instagram"])
      .limit(500)

    if (error) throw new Error(`Failed to list social accounts: ${error.message}`)

    const now = new Date()
    const due = (accounts || [])
      .filter((account) => isTokenCheckDue(account.metadata?.token_checked_at, now))
      .slice(0, MAX_ACCOUNTS_PER_RUN)

    const results = { checked: 0, valid: 0, expiring_soon: 0, invalid: 0, errors: 0 }

    for (const account of due) {
      try {
        const token = await decryptMetaToken(account.access_token)
        if (!token) {
          results.errors++
          continue
        }

        const response = await fetch(
          `${META_GRAPH_API_BASE_URL}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${appId}|${appSecret}`,
        )
        // Treat only definitive responses as authoritative: a transient error
        // must not flag a working token as invalid.
        if (!response.ok && response.status !== 400) {
          results.errors++
          continue
        }

        const payload = await response.json().catch(() => null)
        const health = resolveTokenHealth(payload?.data, now)

        const metadataPatch: Record<string, unknown> = {
          ...(account.metadata || {}),
          token_health: health.status,
          token_checked_at: now.toISOString(),
        }
        // Re-sync permissions only when debug_token actually returned scopes.
        if (health.scopes.length > 0) {
          metadataPatch.granted_scopes = health.scopes
          metadataPatch.granted_granular_scopes = health.granularScopes
          metadataPatch.last_scope_sync_at = now.toISOString()
        }

        const { error: updateError } = await supabase
          .from("social_accounts")
          .update({ token_expires_at: health.expiresAt, metadata: metadataPatch })
          .eq("id", account.id)

        if (updateError) {
          results.errors++
          continue
        }

        results.checked++
        results[health.status]++
        if (health.status !== "valid") {
          console.warn("[TOKEN_HEALTH] Account needs attention", {
            account_id: account.id,
            workspace_id: account.workspace_id,
            platform: account.platform,
            status: health.status,
            expires_at: health.expiresAt,
          })
        }
      } catch (accountError) {
        results.errors++
        console.error("[TOKEN_HEALTH] Check failed:", redactSensitiveLogValue(accountError))
      }
    }

    return json({ success: true, due: due.length, ...results })
  } catch (error) {
    console.error("[TOKEN_HEALTH] Fatal error:", redactSensitiveLogValue(error))
    return json({ success: false, error: error?.message || "Token health sweep failed" }, 500)
  }
})
