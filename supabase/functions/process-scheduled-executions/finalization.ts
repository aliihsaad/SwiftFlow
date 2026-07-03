type JsonRecord = Record<string, unknown>

type UpdateResult = {
  data: { id?: unknown } | null
  error: { message?: string } | null
}

interface ScheduledExecutionUpdateBuilder {
  eq(column: string, value: unknown): ScheduledExecutionUpdateBuilder
  select(columns: string): {
    maybeSingle(): PromiseLike<UpdateResult>
  }
}

export interface ScheduledExecutionFinalizationClient {
  from(table: string): {
    update(values: JsonRecord): ScheduledExecutionUpdateBuilder
  }
}

export type ScheduledExecutionFinalizationResult =
  | { finalized: true }
  | { finalized: false; reason: "lost_claim" }

/**
 * Write the terminal state only while this invocation still owns the claim.
 * A zero-row update means a stale lease was recovered or the row was otherwise
 * no longer owned by this scheduler tick; callers must not count or apply
 * follow-up stats in that case.
 */
export async function finalizeScheduledExecution(
  supabase: ScheduledExecutionFinalizationClient,
  executionId: string,
  claimToken: string,
  updates: JsonRecord,
): Promise<ScheduledExecutionFinalizationResult> {
  if (!executionId) throw new Error("executionId is required")
  if (!claimToken) throw new Error("claimToken is required")

  const { data, error } = await supabase
    .from("automation_scheduled_executions")
    .update({
      ...updates,
      claim_token: null,
      claimed_at: null,
    })
    .eq("id", executionId)
    .eq("claim_token", claimToken)
    .select("id")
    .maybeSingle()

  if (error) {
    throw new Error(error.message || "Failed to finalize scheduled execution")
  }

  return data?.id ? { finalized: true } : { finalized: false, reason: "lost_claim" }
}
