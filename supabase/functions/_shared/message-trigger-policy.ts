/** Keep automatic defaults aligned with instagram_message_trigger_cooldown(). */
export const FOLLOWER_CHECK_COOLDOWN_SECONDS = 60
export const MAX_MESSAGE_COOLDOWN_SECONDS = 3600

type Graph = { nodes?: Array<{ id?: string; data?: { type?: string; config?: unknown } }> }

export function validateMessageTriggerCooldowns(graph: Graph | null | undefined) {
  const issues: Array<{ nodeId: string; message: string }> = []
  for (const node of graph?.nodes || []) {
    const config = (node.data?.config || {}) as Record<string, unknown>
    const seconds = config.recipient_cooldown_seconds
    if (seconds == null) continue
    if (node.data?.type !== 'trigger_new_message' || typeof seconds !== 'number'
      || !Number.isInteger(seconds) || seconds < 0 || seconds > MAX_MESSAGE_COOLDOWN_SECONDS) {
      issues.push({ nodeId: node.id || '', message: 'Recipient cooldown belongs on a New Message trigger and must be a whole number from 0 to 3600 seconds. Use 0 to disable it.' })
    }
  }
  return issues
}
