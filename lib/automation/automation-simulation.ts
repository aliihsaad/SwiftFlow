import {
  ActionExecutor,
  type ActionExecutorRun,
  type ExecutorLookup,
} from "./action-executor"
import type { ActionExecutorConfig } from "./action-safety-gates"
import {
  createRecordingProviderActionAdapter,
  type ProviderActionOutcome,
  type RecordingProviderActionAdapter,
} from "./provider-action-adapter"
import {
  InMemoryActionOutbox,
  InMemoryWebhookInbox,
  SimulationClock,
  type SimulationActionSnapshot,
  type SimulationEnqueueMetrics,
  type SimulationWebhookSnapshot,
} from "./simulation-repositories"
import {
  createCommentPrivateReplyComparisonHandler,
  type CommentComparisonAccount,
  type CommentComparisonLookup,
} from "../webhooks/comment-private-reply-comparison"
import { buildMetaWebhookInboxEvents } from "../webhooks/inbox-contract"
import {
  WebhookInboxWorker,
  type WebhookInboxWorkerRun,
} from "../webhooks/inbox-worker"

export const AUTOMATION_SIMULATION_SCENARIOS = [
  "happy_path",
  "duplicate_delivery",
  "worker_crash_recovery",
  "provider_outage",
  "retry_exhaustion",
] as const

export type AutomationSimulationScenario =
  (typeof AUTOMATION_SIMULATION_SCENARIOS)[number]

const SIMULATION_WORKSPACE_ID = "11111111-1111-4111-8111-111111111111"
const SIMULATION_SOCIAL_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222"
const SIMULATION_AUTOMATION_ID = "33333333-3333-4333-8333-333333333333"
const SIMULATION_WORKFLOW_VERSION_ID = "44444444-4444-4444-8444-444444444444"
const DEFAULT_INITIAL_TIME = "2026-07-28T12:00:00.000Z"
const RETRY_ADVANCE_MS = 24 * 60 * 60 * 1_000

export interface SyntheticCommentFixtureOptions {
  accountExternalId?: string
  commentId?: string
  commentText?: string
  commenterExternalId?: string
  mediaId?: string
}

export interface AutomationSimulationOptions {
  scenario: AutomationSimulationScenario
  webhookBody?: Record<string, unknown>
  initialTime?: string
}

export interface AutomationSimulationResult {
  mode: "simulation"
  scenario: AutomationSimulationScenario
  passed: boolean
  assertions: Record<string, boolean>
  providerCapability: "recording_only"
  networkCalls: 0
  fixtureEventKey: string
  ingestion: SimulationEnqueueMetrics[]
  inboxWorkerRuns: WebhookInboxWorkerRun[]
  executorRuns: ActionExecutorRun[]
  inbox: SimulationWebhookSnapshot[]
  actionOutbox: SimulationActionSnapshot[]
  providerCalls: number
  executorEvents: Record<string, unknown>[]
}

export interface AutomationSimulationSuiteResult {
  mode: "simulation"
  passed: boolean
  networkCalls: 0
  scenarios: AutomationSimulationResult[]
}

interface SimulationEnvironment {
  clock: SimulationClock
  inbox: InMemoryWebhookInbox
  outbox: InMemoryActionOutbox
  handler: ReturnType<typeof createCommentPrivateReplyComparisonHandler>
  adapter: RecordingProviderActionAdapter
  executorEvents: Record<string, unknown>[]
  events: ReturnType<typeof buildMetaWebhookInboxEvents>
  createInboxWorker(workerId: string): WebhookInboxWorker
  createExecutor(): ActionExecutor
}

/**
 * Safe default fixture for local and CI simulation. Values are deliberately
 * synthetic and contain no provider credentials or user data.
 */
export function createSyntheticCommentWebhookFixture(
  options: SyntheticCommentFixtureOptions = {},
): Record<string, unknown> {
  const accountExternalId = options.accountExternalId || "17890000000000000"
  const commentId = options.commentId || "simulation-comment-001"
  const commentText = options.commentText || "Please send the SwiftFlow details"
  const commenterExternalId =
    options.commenterExternalId || "simulation-customer-001"
  const mediaId = options.mediaId || "simulation-media-001"

  return {
    object: "instagram",
    entry: [
      {
        id: accountExternalId,
        time: 1_785_103_200,
        changes: [
          {
            field: "comments",
            value: {
              id: commentId,
              text: commentText,
              from: {
                id: commenterExternalId,
                username: "simulation_customer",
                self_ig_scoped_id: commenterExternalId,
              },
              media: {
                id: mediaId,
                media_product_type: "FEED",
              },
            },
          },
        ],
      },
    ],
  }
}

function privateReplyGraph(): Record<string, unknown> {
  return {
    nodes: [
      {
        id: "simulation-trigger",
        data: {
          type: "trigger_new_comment",
          config: {
            trigger_type: "any",
            post_scope: "any",
            social_account_id: SIMULATION_SOCIAL_ACCOUNT_ID,
          },
        },
      },
      {
        id: "simulation-private-reply",
        data: {
          type: "action_private_reply",
          config: {
            message: "Simulation reply: no provider request was made.",
          },
        },
      },
    ],
    edges: [
      {
        source: "simulation-trigger",
        target: "simulation-private-reply",
      },
    ],
  }
}

function simulationAccount(
  accountExternalId: string,
): CommentComparisonAccount {
  return {
    workspaceId: SIMULATION_WORKSPACE_ID,
    socialAccountId: SIMULATION_SOCIAL_ACCOUNT_ID,
    accountId: accountExternalId,
    connectedPageId: null,
    automations: [
      {
        id: SIMULATION_AUTOMATION_ID,
        socialAccountId: SIMULATION_SOCIAL_ACCOUNT_ID,
        workflowVersionId: SIMULATION_WORKFLOW_VERSION_ID,
        workflowGraph: privateReplyGraph(),
      },
    ],
  }
}

function executorConfig(accountExternalId: string): ActionExecutorConfig {
  return {
    // The gate is enabled only inside this in-memory harness. The injected
    // recording adapter has no network capability.
    providerActionsEnabled: true,
    allowlist: [accountExternalId],
    maxActionsPerAccount: 100,
    rateWindowMs: 60_000,
    durableRuntimeGuardsRequired: false,
    providerSendAccountBudget: 100,
    providerSendAutomationBudget: 100,
    providerSendBudgetWindowSeconds: 3_600,
    providerSendCircuitFailureThreshold: 5,
    providerSendCircuitCooldownSeconds: 300,
    workerId: "simulation-action-executor",
    batchSize: 10,
    leaseSeconds: 60,
    pollIntervalMs: 1,
    runOnce: true,
  }
}

function createSimulationEnvironment(
  body: Record<string, unknown>,
  initialTime: string,
): SimulationEnvironment {
  const clock = new SimulationClock(initialTime)
  const events = buildMetaWebhookInboxEvents(body)
  const commentEvents = events.filter((event) => (
    event.provider === "meta" && event.eventType === "comments"
  ))

  if (events.length !== 1 || commentEvents.length !== 1) {
    throw new Error(
      "Automation simulation requires exactly one Meta comments event in the fixture",
    )
  }

  const accountExternalId = commentEvents[0]!.accountExternalId
  if (!accountExternalId) {
    throw new Error("Automation simulation fixture is missing the account external id")
  }

  const account = simulationAccount(accountExternalId)
  const inbox = new InMemoryWebhookInbox(clock)
  const outbox = new InMemoryActionOutbox(clock, 3)
  const comparisonLookup: CommentComparisonLookup = {
    async findAccountAndAutomations(candidate) {
      return candidate === accountExternalId ? account : null
    },
  }
  const executorLookup: ExecutorLookup = {
    async findAccount(socialAccountId) {
      if (socialAccountId !== SIMULATION_SOCIAL_ACCOUNT_ID) return null
      return {
        socialAccountId: SIMULATION_SOCIAL_ACCOUNT_ID,
        externalAccountId: accountExternalId,
        // A non-provider sentinel accepted by the production credential gate.
        // It is consumed only as a boolean by the recording adapter.
        accessToken: "simulation-only-credential",
        metadata: {
          permissions: [
            "instagram_business_basic",
            "instagram_business_manage_comments",
          ],
        },
      }
    },
    async findAutomation(automationId) {
      return automationId === SIMULATION_AUTOMATION_ID
        ? { id: automationId, isActive: true }
        : null
    },
  }
  const handler = createCommentPrivateReplyComparisonHandler(comparisonLookup, {
    actionOutbox: outbox,
  })
  const adapter = createRecordingProviderActionAdapter("simulation-recording")
  const executorEvents: Record<string, unknown>[] = []

  return {
    clock,
    inbox,
    outbox,
    handler,
    adapter,
    executorEvents,
    events,
    createInboxWorker(workerId) {
      return new WebhookInboxWorker(inbox, handler, {
        workerId,
        batchSize: 10,
        leaseSeconds: 5,
        retryBaseMs: 1_000,
        retryMaxMs: 1_000,
        now: clock.nowDate,
      })
    },
    createExecutor() {
      return new ActionExecutor({
        config: executorConfig(accountExternalId),
        repository: outbox,
        lookup: executorLookup,
        adapter,
        now: clock.nowDate,
        onEvent(event) {
          executorEvents.push(event)
        },
      })
    },
  }
}

function retryableProviderOutage(): ProviderActionOutcome {
  return {
    ok: false,
    failure: {
      status: 503,
      code: "simulation_provider_unavailable",
      message: "Synthetic provider outage",
      retryAfterSeconds: 30,
    },
  }
}

function scenarioAssertions(
  scenario: AutomationSimulationScenario,
  environment: SimulationEnvironment,
): Record<string, boolean> {
  const inbox = environment.inbox.snapshots()
  const outbox = environment.outbox.snapshots()
  const inboxMetrics = environment.inbox.metrics()
  const actionMetrics = environment.outbox.metrics()
  const firstInbox = inbox[0]
  const firstAction = outbox[0]
  const common = {
    exactlyOneInboxEvent: inbox.length === 1,
    inboxCompleted: firstInbox?.status === "succeeded",
    exactlyOneLogicalAction: outbox.length === 1,
    noLiveNetworkCapability: environment.adapter.name === "simulation-recording",
  }

  if (scenario === "duplicate_delivery") {
    return {
      ...common,
      webhookReplayDeduplicated:
        inboxMetrics.inserted === 1 && inboxMetrics.duplicates === 1,
      providerActionSentOnce:
        firstAction?.status === "succeeded"
        && environment.adapter.calls.length === 1,
    }
  }

  if (scenario === "worker_crash_recovery") {
    return {
      ...common,
      expiredInboxLeaseReclaimed: firstInbox?.attemptCount === 2,
      repeatedPlanningDeduplicated:
        actionMetrics.inserted === 1 && actionMetrics.duplicates === 1,
      providerActionSentOnce:
        firstAction?.status === "succeeded"
        && environment.adapter.calls.length === 1,
    }
  }

  if (scenario === "provider_outage") {
    return {
      ...common,
      retryScheduled: firstAction?.status === "retry_scheduled",
      oneRecordedAttempt:
        firstAction?.attemptCount === 1
        && environment.adapter.calls.length === 1,
      safeProviderErrorRecorded:
        firstAction?.lastErrorCode === "simulation_provider_unavailable",
    }
  }

  if (scenario === "retry_exhaustion") {
    return {
      ...common,
      retryBudgetExhausted: firstAction?.status === "dead_lettered",
      boundedAttempts:
        firstAction?.attemptCount === firstAction?.maxAttempts
        && environment.adapter.calls.length === firstAction?.maxAttempts,
    }
  }

  return {
    ...common,
    providerActionSentOnce:
      firstAction?.status === "succeeded"
      && firstAction.attemptCount === 1
      && environment.adapter.calls.length === 1,
  }
}

export async function runAutomationSimulation(
  options: AutomationSimulationOptions,
): Promise<AutomationSimulationResult> {
  const body = options.webhookBody || createSyntheticCommentWebhookFixture()
  const environment = createSimulationEnvironment(
    body,
    options.initialTime || DEFAULT_INITIAL_TIME,
  )
  const ingestion: SimulationEnqueueMetrics[] = []
  const inboxWorkerRuns: WebhookInboxWorkerRun[] = []
  const executorRuns: ActionExecutorRun[] = []

  ingestion.push(await environment.inbox.enqueue(environment.events))

  if (options.scenario === "duplicate_delivery") {
    ingestion.push(await environment.inbox.enqueue(environment.events))
  }

  if (options.scenario === "worker_crash_recovery") {
    const claimed = await environment.inbox.claim(
      "simulation-crashed-comparison-worker",
      1,
      5,
    )
    const event = claimed[0]
    if (!event) throw new Error("Crash simulation could not claim the fixture event")

    // Execute the production handler, then intentionally skip finalisation to
    // model a process dying after enqueue but before inbox completion.
    await environment.handler(event, {
      heartbeat: () => environment.inbox.extendLease(
        event.id,
        event.lockedBy,
        5,
      ),
    })
    environment.clock.advance(5_001)
    inboxWorkerRuns.push(
      await environment
        .createInboxWorker("simulation-recovery-comparison-worker")
        .runOnce(),
    )
  } else {
    inboxWorkerRuns.push(
      await environment
        .createInboxWorker("simulation-comparison-worker")
        .runOnce(),
    )
  }

  const executor = environment.createExecutor()
  if (options.scenario === "provider_outage") {
    environment.adapter.enqueueOutcome(retryableProviderOutage())
    executorRuns.push(await executor.runOnce())
  } else if (options.scenario === "retry_exhaustion") {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      environment.adapter.enqueueOutcome(retryableProviderOutage())
      executorRuns.push(await executor.runOnce())
      environment.clock.advance(RETRY_ADVANCE_MS)
    }
  } else {
    executorRuns.push(await executor.runOnce())
  }

  const assertions = scenarioAssertions(options.scenario, environment)
  return {
    mode: "simulation",
    scenario: options.scenario,
    passed: Object.values(assertions).every(Boolean),
    assertions,
    providerCapability: "recording_only",
    networkCalls: 0,
    fixtureEventKey: environment.events[0]!.providerEventKey,
    ingestion,
    inboxWorkerRuns,
    executorRuns,
    inbox: environment.inbox.snapshots(),
    actionOutbox: environment.outbox.snapshots(),
    providerCalls: environment.adapter.calls.length,
    executorEvents: environment.executorEvents,
  }
}

export async function runAutomationSimulationSuite(
  options: Omit<AutomationSimulationOptions, "scenario"> = {},
): Promise<AutomationSimulationSuiteResult> {
  const scenarios: AutomationSimulationResult[] = []
  for (const scenario of AUTOMATION_SIMULATION_SCENARIOS) {
    scenarios.push(await runAutomationSimulation({ ...options, scenario }))
  }

  return {
    mode: "simulation",
    passed: scenarios.every((scenario) => scenario.passed),
    networkCalls: 0,
    scenarios,
  }
}
