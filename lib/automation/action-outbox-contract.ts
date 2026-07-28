import crypto from "node:crypto"

export const ACTION_OUTBOX_STATUSES = [
  "pending",
  "claimed",
  "succeeded",
  "retry_scheduled",
  "dead_lettered",
  "suppressed",
] as const

export type ActionOutboxStatus = (typeof ACTION_OUTBOX_STATUSES)[number]

/**
 * The deterministic identity of one intended provider action.
 *
 * Replaying the same webhook recomputes every field identically, so the unique
 * constraint over these columns is what makes duplicate delivery incapable of
 * producing a duplicate send. `workflowVersionId` pins the action to the graph
 * snapshot that produced it, so editing an automation mid-flight cannot silently
 * change what a queued action does.
 */
export interface ProviderActionIdentity {
  provider: "meta"
  providerEventKey: string
  automationId: string
  workflowVersionId: string
  nodeId: string
  actionType: string
  /** Provider-side destination: a comment id for a private reply, etc. */
  targetId: string
}

export interface ProviderActionRequest {
  identity: ProviderActionIdentity
  workspaceId: string | null
  socialAccountId: string | null
  /** Rendered action payload. Never contains a provider token. */
  payload: Record<string, unknown>
}

export interface ActionOutboxRecord {
  id: string
  identity: ProviderActionIdentity
  workspaceId: string | null
  socialAccountId: string | null
  payload: Record<string, unknown>
  status: ActionOutboxStatus
  attemptCount: number
  maxAttempts: number
  lockedBy: string
  lockExpiresAt: string
}

export interface ActionOutboxEnqueueResult {
  total: number
  inserted: number
  duplicates: number
}

const ALLOWED_STATUS_TRANSITIONS: Readonly<Record<ActionOutboxStatus, readonly ActionOutboxStatus[]>> = {
  pending: ["claimed", "suppressed"],
  claimed: ["succeeded", "retry_scheduled", "dead_lettered", "suppressed"],
  retry_scheduled: ["claimed", "dead_lettered", "suppressed"],
  succeeded: [],
  dead_lettered: [],
  suppressed: [],
}

export function canTransitionActionOutboxStatus(
  from: ActionOutboxStatus,
  to: ActionOutboxStatus,
): boolean {
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to)
}

/**
 * Stable string form of the identity, used for logging and for in-memory
 * deduplication before the database is touched. The database constraint remains
 * the authority; this is a convenience, not the enforcement point.
 */
export function buildProviderActionIdentityKey(identity: ProviderActionIdentity): string {
  return [
    identity.provider,
    identity.providerEventKey,
    identity.automationId,
    identity.workflowVersionId,
    identity.nodeId,
    identity.actionType,
    identity.targetId,
  ].join("|")
}

export function hashProviderActionIdentity(identity: ProviderActionIdentity): string {
  return crypto
    .createHash("sha256")
    .update(buildProviderActionIdentityKey(identity))
    .digest("hex")
}

/**
 * Derives a stable snapshot id for a workflow graph.
 *
 * Immutable workflow versions are later roadmap work. Until they exist, hashing
 * the graph gives the same guarantee for idempotency purposes: an unchanged
 * graph yields an unchanged id, and an edited graph yields a new one rather than
 * silently reusing a queued action's identity.
 */
export function deriveWorkflowVersionId(workflowGraph: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(workflowGraph)))
    .digest("hex")
    .slice(0, 32)
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== "object") return value

  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]),
  )
}
