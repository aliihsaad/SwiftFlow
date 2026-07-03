/**
 * Claim locking for the publishing automation runner.
 *
 * Plain TypeScript with no Deno or URL imports so both the Edge Function and
 * the Node test suite can import it. Atomicity lives in the Postgres function
 * claim_due_publishing_automations (FOR UPDATE SKIP LOCKED with stale-lease
 * recovery); this module owns the invocation-side contract: claim due rows
 * with a per-invocation token, then finalize with a token-guarded release so
 * a stale invocation can never overwrite a newer claim.
 */

type JsonRecord = Record<string, unknown>

export const CLAIM_DUE_PUBLISHING_AUTOMATIONS_RPC = "claim_due_publishing_automations"

// A claim that is not finalized within this window is considered abandoned
// and becomes claimable again. Must comfortably exceed the Edge Function's
// maximum wall-clock runtime so a slow-but-alive invocation is not recovered.
export const CLAIM_STALE_AFTER_MINUTES = 30

type RpcResult = { data: unknown; error: { message?: string } | null }
type UpdateResult = { error: { message?: string } | null }

interface ClaimUpdateBuilder extends PromiseLike<UpdateResult> {
  eq(column: string, value: unknown): ClaimUpdateBuilder
}

export interface ClaimClient {
  rpc(fn: string, args: JsonRecord): PromiseLike<RpcResult>
  from(table: string): { update(values: JsonRecord): ClaimUpdateBuilder }
}

export async function claimDuePublishingAutomations(
  supabase: ClaimClient,
  claimToken: string,
  limit: number,
): Promise<JsonRecord[]> {
  const { data, error } = await supabase.rpc(CLAIM_DUE_PUBLISHING_AUTOMATIONS_RPC, {
    p_claim_token: claimToken,
    p_limit: limit,
    p_stale_after_minutes: CLAIM_STALE_AFTER_MINUTES,
  })
  if (error) throw new Error(error.message || "Failed to claim due publishing automations")
  return Array.isArray(data) ? (data as JsonRecord[]) : []
}

/**
 * Release a claim held by this invocation, optionally applying final-state
 * updates (next_run_at, last_run_at, last_error). The claim_token equality
 * guard makes the release a no-op when the lease was already recovered and
 * re-claimed by a newer invocation. Returns an error message instead of
 * throwing so failure paths can report without masking the original error.
 */
export async function releasePublishingAutomationClaim(
  supabase: ClaimClient,
  automationId: string,
  claimToken: string,
  updates: JsonRecord = {},
): Promise<string | null> {
  const { error } = await supabase
    .from("publishing_automations")
    .update({
      claim_token: null,
      claimed_at: null,
      updated_at: new Date().toISOString(),
      ...updates,
    })
    .eq("id", automationId)
    .eq("claim_token", claimToken)
  return error ? (error.message || "Failed to release publishing automation claim") : null
}
