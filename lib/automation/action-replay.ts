export interface ActionReplaySnapshot {
  status: string
  outcomeAmbiguous?: boolean | null
  lastErrorCode?: string | null
}

export interface ActionReplayEligibility {
  allowed: boolean
  reason:
    | "safe_to_replay"
    | "action_is_active"
    | "action_already_succeeded"
    | "ambiguous_provider_outcome"
    | "status_not_replayable"
}

const AMBIGUOUS_ERROR_CODES = new Set([
  "request_timeout",
  "network_failure",
  "lease_expired_after_final_attempt",
])

export function evaluateActionReplay(
  snapshot: ActionReplaySnapshot,
): ActionReplayEligibility {
  if (snapshot.status === "succeeded") {
    return { allowed: false, reason: "action_already_succeeded" }
  }

  if (["pending", "claimed", "retry_scheduled"].includes(snapshot.status)) {
    return { allowed: false, reason: "action_is_active" }
  }

  if (!["suppressed", "dead_lettered"].includes(snapshot.status)) {
    return { allowed: false, reason: "status_not_replayable" }
  }

  if (
    snapshot.status === "dead_lettered"
    && (
      snapshot.outcomeAmbiguous === true
      || AMBIGUOUS_ERROR_CODES.has(String(snapshot.lastErrorCode || ""))
    )
  ) {
    return { allowed: false, reason: "ambiguous_provider_outcome" }
  }

  return { allowed: true, reason: "safe_to_replay" }
}
