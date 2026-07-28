import type { ActionOutboxRecord } from "./action-outbox-contract"
import type { ProviderFailure } from "./action-retry-policy"

export interface ProviderActionCredentials {
  accessToken: string
  externalAccountId: string
}

export type ProviderActionOutcome =
  | { ok: true; providerResponseId: string | null; response: Record<string, unknown> }
  | { ok: false; failure: ProviderFailure }

export interface ProviderActionAdapter {
  readonly name: string
  send(
    record: ActionOutboxRecord,
    credentials: ProviderActionCredentials,
  ): Promise<ProviderActionOutcome>
}

export interface RecordedProviderCall {
  actionType: string
  targetId: string
  automationId: string
  providerEventKey: string
  /** Present only so tests can assert redaction; never logged. */
  usedAccessToken: boolean
}

export interface RecordingProviderActionAdapter extends ProviderActionAdapter {
  readonly calls: RecordedProviderCall[]
  /** Queue an outcome for the next call; defaults to success. */
  enqueueOutcome(outcome: ProviderActionOutcome): void
}

/**
 * Fake adapter used by every test and by the pre-approval staging rehearsal.
 *
 * It performs no network I/O whatsoever, so a test that accidentally exercises
 * the real send path fails loudly rather than contacting Meta.
 */
export function createRecordingProviderActionAdapter(
  name = "recording",
): RecordingProviderActionAdapter {
  const calls: RecordedProviderCall[] = []
  const queued: ProviderActionOutcome[] = []

  return {
    name,
    calls,
    enqueueOutcome(outcome) {
      queued.push(outcome)
    },
    async send(record, credentials) {
      calls.push({
        actionType: record.identity.actionType,
        targetId: record.identity.targetId,
        automationId: record.identity.automationId,
        providerEventKey: record.identity.providerEventKey,
        usedAccessToken: Boolean(credentials.accessToken),
      })

      return queued.shift() ?? {
        ok: true,
        providerResponseId: `recorded-${calls.length}`,
        response: { recorded: true },
      }
    },
  }
}

/**
 * Adapter that refuses to do anything.
 *
 * This is the default wiring for the executor so that a misconfigured
 * deployment cannot send even if every gate were somehow satisfied. The real
 * Meta adapter must be injected deliberately.
 */
/**
 * Chooses the adapter for a deployment.
 *
 * Defence in depth: when the kill switch is off the real adapter is never even
 * constructed, so there is nothing capable of a network call in the process.
 * The gates would suppress the action anyway; this removes the capability
 * entirely rather than relying on a single check.
 */
export function resolveProviderActionAdapter(
  providerActionsEnabled: boolean,
  createRealAdapter: () => ProviderActionAdapter,
): ProviderActionAdapter {
  return providerActionsEnabled ? createRealAdapter() : createDisabledProviderActionAdapter()
}

export function createDisabledProviderActionAdapter(): ProviderActionAdapter {
  return {
    name: "disabled",
    async send() {
      return {
        ok: false,
        failure: {
          code: "provider_adapter_disabled",
          message: "No provider adapter is configured for this deployment.",
          status: 400,
        },
      }
    },
  }
}
