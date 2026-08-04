
// @ts-nocheck - Deno runtime
/**
 * Instagram Token Refresh (internal scheduled worker)
 *
 * Proactively renews valid Instagram long-lived access tokens before they
 * expire. scheduler-tick dispatches this worker once per hour, on the tick whose
 * minute is 5 — not once per day. It can also be dispatched manually via
 * service-role internal invoke. It is never invoked from a user session.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { assertInternalInvoke } from "../_shared/internal-auth.ts"
import { decryptMetaToken, encryptMetaToken } from "../_shared/meta-account.ts"
import {
  INSTAGRAM_REFRESH_URL,
  type RefreshPolicyConfig,
  defaultRefreshPolicyConfig,
  resolveRefreshPolicyConfig,
} from "../_shared/instagram-token-refresh-policy.ts"
import {
  type RefreshRunSummary,
  buildTokenRefreshMetadataPatch,
  classifyRefreshAttemptResult,
  createRefreshRunSummary,
  outcomeFromResult,
  recordRefreshOutcome,
  sanitizeRefreshOutcomeForLogging,
  shouldSendRefreshAlert,
} from "../_shared/instagram-token-refresh-state.ts"
import { callTelegramBotApi, loadTelegramWorkspaceConnection } from "../_shared/automation-telegram.ts"
import { redactSensitiveLogValue } from "../_shared/log-redaction.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const DEFAULT_MAX_ACCOUNTS_PER_RUN = 20
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000
const DEFAULT_MAX_RETRY_ATTEMPTS = 5
const MAX_RESPONSE_BYTES = 100_000

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function envInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name)
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function buildConfig(): RefreshPolicyConfig {
  return resolveRefreshPolicyConfig({
    renewalWindowDays: envInt("INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS", defaultRefreshPolicyConfig().renewalWindowDays),
    maxRetryAttempts: envInt("INSTAGRAM_TOKEN_REFRESH_MAX_RETRY_ATTEMPTS", DEFAULT_MAX_RETRY_ATTEMPTS),
    baseRetryDelayMinutes: defaultRefreshPolicyConfig().baseRetryDelayMinutes,
    maxRetryDelayHours: defaultRefreshPolicyConfig().maxRetryDelayHours,
    jitter: true,
  })
}

function generateInvocationId(): string {
  return crypto.randomUUID()
}

async function callInstagramRefresh(
  accessToken: string,
  timeoutMs: number,
): Promise<{ ok: true; body: unknown } | { ok: false; httpStatus: number; body: unknown }> {
  const url = new URL(INSTAGRAM_REFRESH_URL)
  url.searchParams.set("grant_type", "ig_refresh_token")
  url.searchParams.set("access_token", accessToken)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
    })

    if (response.status >= 300 && response.status < 400) {
      return { ok: false, httpStatus: response.status, body: { error: { message: "unexpected_redirect" } } }
    }

    const text = await response.text()
    if (text.length > MAX_RESPONSE_BYTES) {
      return { ok: false, httpStatus: 502, body: { error: { message: "response_too_large" } } }
    }

    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = { error: { message: "invalid_json" } }
    }

    if (!response.ok) {
      return { ok: false, httpStatus: response.status, body }
    }

    return { ok: true, body }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, httpStatus: 408, body: { error: { message: "request_timeout" } } }
    }
    return { ok: false, httpStatus: 0, body: { error: { message: "network_error" } } }
  } finally {
    clearTimeout(timeout)
  }
}


async function sendRefreshAlert(
  supabase: any,
  account: { id: string; workspace_id: string; account_name?: string | null },
  status: "reconnect_required" | "retry_scheduled",
  reason: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const connection = await loadTelegramWorkspaceConnection(supabase, account.workspace_id)
    const accountLabel = account.account_name || "Instagram account"
    const action = status === "reconnect_required"
      ? "Reconnect Instagram in Settings to restore the connection."
      : "Automatic renewal will keep retrying. No action is required unless this alert repeats."
    const text = `SwiftFlow Instagram token alert\n\nAccount: ${accountLabel}\nStatus: ${status.replace(/_/g, " ")}\nReason: ${reason.replace(/_/g, " ")}\n\n${action}`

    await callTelegramBotApi(connection.botToken, "sendMessage", {
      chat_id: connection.chatId,
      text: text.slice(0, 4096),
      disable_web_page_preview: true,
    })

    metadata.token_refresh_alert_sent_at = new Date().toISOString()
    metadata.token_refresh_alert_reason = reason
  } catch (error) {
    console.warn("[INSTAGRAM_TOKEN_REFRESH] Telegram alert failed", {
      account_id: account.id,
      workspace_id: account.workspace_id,
      error: redactSensitiveLogValue(error),
    })
  }
}

async function processAccount(
  supabase: any,
  account: Record<string, unknown>,
  config: RefreshPolicyConfig,
  timeoutMs: number,
  summary: RefreshRunSummary,
  invocationId: string,
  claimToken: string,
): Promise<void> {
  const accountStartedAt = Date.now()
  const accountId = account.id as string
  const workspaceId = account.workspace_id as string
  const accountName = account.account_name as string | null | undefined
  const existingMetadata = account.metadata && typeof account.metadata === "object"
    ? { ...(account.metadata as Record<string, unknown>) }
    : {}

  try {
    const accessToken = await decryptMetaToken(account.access_token)
    if (!accessToken) {
      recordRefreshOutcome(summary, "error")
      console.warn("[INSTAGRAM_TOKEN_REFRESH] Missing decrypted token", {
        invocation_id: invocationId,
        account_id: accountId,
        workspace_id: workspaceId,
      })
      return
    }

    const now = new Date()
    const refreshResult = await callInstagramRefresh(accessToken, timeoutMs)
    const classified = classifyRefreshAttemptResult(refreshResult, config, now)
    const outcome = outcomeFromResult(classified)
    const metadataPatch = buildTokenRefreshMetadataPatch({
      result: classified,
      existingMetadata,
      now,
      config,
    })

    // Alerting happens before the write so the dedupe stamp lands in the same
    // update. A permanent failure (revoked/expired token) alerts immediately;
    // transient failures only escalate once retries have piled up. Both paths
    // share the 24h dedupe window.
    if (outcome === "reconnect_required" || outcome === "retry_scheduled") {
      const attemptCount = Number(metadataPatch.token_refresh_attempt_count) || 0
      const reason = outcome === "reconnect_required"
        ? String(metadataPatch.reconnect_reason || "token_expired_or_revoked")
        : String(metadataPatch.token_refresh_last_error_code || "transient_refresh_failure")
      if (shouldSendRefreshAlert(
        existingMetadata,
        attemptCount,
        config.maxRetryAttempts,
        now,
        outcome === "reconnect_required",
      )) {
        await sendRefreshAlert(
          supabase,
          { id: accountId, workspace_id: workspaceId, account_name: accountName },
          outcome as "reconnect_required" | "retry_scheduled",
          reason,
          metadataPatch,
        )
      }
    }

    const updatePayload: Record<string, unknown> = {
      metadata: metadataPatch,
      refresh_claim_token: null,
      refresh_claimed_at: null,
      updated_at: new Date().toISOString(),
    }
    if (classified.kind === "success") {
      const encrypted = await encryptMetaToken(classified.accessToken)
      if (!encrypted) {
        throw new Error("encryption_failed")
      }
      updatePayload.access_token = encrypted
      updatePayload.token_expires_at = metadataPatch.token_expires_at
    }

    // Single write per account, gated on still owning the lease. If the lease
    // went stale and another invocation re-claimed the row, no row matches and
    // we abort instead of overwriting the newer worker's state.
    const { data: updatedAccount, error: updateError } = await supabase
      .from("social_accounts")
      .update(updatePayload)
      .eq("id", accountId)
      .eq("refresh_claim_token", claimToken)
      .select("id")
      .maybeSingle()

    if (updateError) {
      throw updateError
    }
    if (!updatedAccount) {
      throw new Error("refresh_claim_lost")
    }

    recordRefreshOutcome(summary, outcome)

    console.log("[INSTAGRAM_TOKEN_REFRESH] Account processed", {
      ...sanitizeRefreshOutcomeForLogging({
        accountId: accountId,
        workspaceId: workspaceId,
        outcome,
        categoryCode: classified.kind === "success" ? undefined : classified.category,
        durationMs: Date.now() - accountStartedAt,
        attemptCount: Number(metadataPatch.token_refresh_attempt_count) || 0,
      }),
      invocation_id: invocationId,
    })
  } catch (accountError) {
    recordRefreshOutcome(summary, "error")
    console.error("[INSTAGRAM_TOKEN_REFRESH] Account error", {
      invocation_id: invocationId,
      account_id: accountId,
      workspace_id: workspaceId,
      error: redactSensitiveLogValue(accountError),
    })
  }
}



serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const unauthorized = await assertInternalInvoke(req, corsHeaders)
  if (unauthorized) return unauthorized

  const invocationId = generateInvocationId()
  const startedAt = Date.now()
  const config = buildConfig()
  const maxAccounts = envInt("INSTAGRAM_TOKEN_REFRESH_MAX_ACCOUNTS", DEFAULT_MAX_ACCOUNTS_PER_RUN)
  const timeoutMs = envInt("INSTAGRAM_TOKEN_REFRESH_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS)

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const summary = createRefreshRunSummary()

  try {
    const claimToken = crypto.randomUUID()
    const { data: claimed, error: claimError } = await supabase.rpc("claim_due_instagram_token_refreshes", {
      p_claim_token: claimToken,
      p_limit: maxAccounts,
      p_stale_after_minutes: 30,
      p_renewal_window_days: config.renewalWindowDays,
    })

    if (claimError) {
      console.error("[INSTAGRAM_TOKEN_REFRESH] Claim failed", {
        invocation_id: invocationId,
        error: redactSensitiveLogValue(claimError),
      })
      return json({ success: false, error: "claim_failed" }, 500)
    }

    const accounts = Array.isArray(claimed) ? claimed : []
    console.log("[INSTAGRAM_TOKEN_REFRESH] Claimed accounts", {
      invocation_id: invocationId,
      count: accounts.length,
    })

    for (const account of accounts) {
      await processAccount(supabase, account, config, timeoutMs, summary, invocationId, claimToken)
    }

    const durationMs = Date.now() - startedAt
    console.log("[INSTAGRAM_TOKEN_REFRESH] Run complete", {
      invocation_id: invocationId,
      duration_ms: durationMs,
      ...summary,
    })

    return json({
      success: true,
      invocation_id: invocationId,
      duration_ms: durationMs,
      summary,
    })
  } catch (error) {
    console.error("[INSTAGRAM_TOKEN_REFRESH] Fatal error", {
      invocation_id: invocationId,
      error: redactSensitiveLogValue(error),
    })
    return json({ success: false, error: "instagram_token_refresh_failed" }, 500)
  }
})
