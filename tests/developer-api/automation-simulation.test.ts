import { describe, expect, it } from "vitest"

import {
  AUTOMATION_SIMULATION_SCENARIOS,
  createSyntheticCommentWebhookFixture,
  runAutomationSimulation,
  runAutomationSimulationSuite,
} from "@/lib/automation/automation-simulation"
import { parseAutomationSimulationArguments } from "@/workers/automation-simulation"

describe("deterministic automation simulation", () => {
  it("passes the complete no-network scenario suite", async () => {
    const result = await runAutomationSimulationSuite()

    expect(result.passed).toBe(true)
    expect(result.networkCalls).toBe(0)
    expect(result.scenarios.map((scenario) => scenario.scenario))
      .toEqual(AUTOMATION_SIMULATION_SCENARIOS)
    expect(result.scenarios.every((scenario) => (
      scenario.providerCapability === "recording_only"
      && scenario.networkCalls === 0
    ))).toBe(true)
  })

  it.each(AUTOMATION_SIMULATION_SCENARIOS)(
    "%s is deterministic and satisfies every scenario invariant",
    async (scenario) => {
      const first = await runAutomationSimulation({ scenario })
      const second = await runAutomationSimulation({ scenario })

      expect(first.passed).toBe(true)
      expect(Object.values(first.assertions).every(Boolean)).toBe(true)
      expect(second).toEqual(first)
    },
  )

  it("deduplicates a webhook replay before it can create a second action", async () => {
    const result = await runAutomationSimulation({
      scenario: "duplicate_delivery",
    })

    expect(result.ingestion).toEqual([
      { total: 1, inserted: 1, duplicates: 0 },
      { total: 1, inserted: 0, duplicates: 1 },
    ])
    expect(result.inbox).toHaveLength(1)
    expect(result.actionOutbox).toHaveLength(1)
    expect(result.providerCalls).toBe(1)
  })

  it("reclaims an expired comparison lease and deduplicates repeated planning", async () => {
    const result = await runAutomationSimulation({
      scenario: "worker_crash_recovery",
    })

    expect(result.inbox[0]).toMatchObject({
      status: "succeeded",
      attemptCount: 2,
    })
    expect(result.actionOutbox[0]).toMatchObject({
      status: "succeeded",
      attemptCount: 1,
    })
    expect(result.providerCalls).toBe(1)
  })

  it("schedules an outage retry without constructing a live provider adapter", async () => {
    const result = await runAutomationSimulation({
      scenario: "provider_outage",
    })

    expect(result.actionOutbox[0]).toMatchObject({
      status: "retry_scheduled",
      attemptCount: 1,
      lastErrorCode: "simulation_provider_unavailable",
    })
    expect(result.providerCapability).toBe("recording_only")
    expect(result.networkCalls).toBe(0)
  })

  it("dead-letters after the bounded retry budget is exhausted", async () => {
    const result = await runAutomationSimulation({
      scenario: "retry_exhaustion",
    })

    expect(result.actionOutbox[0]).toMatchObject({
      status: "dead_lettered",
      attemptCount: 3,
      maxAttempts: 3,
    })
    expect(result.providerCalls).toBe(3)
  })

  it("uses the simulation clock for retries even when it predates wall-clock time", async () => {
    const result = await runAutomationSimulation({
      scenario: "retry_exhaustion",
      initialTime: "2000-01-01T00:00:00.000Z",
    })

    expect(result.actionOutbox[0]).toMatchObject({
      status: "dead_lettered",
      attemptCount: 3,
      maxAttempts: 3,
    })
    expect(result.passed).toBe(true)
  })

  it("accepts a sanitized captured comment fixture", async () => {
    const fixture = createSyntheticCommentWebhookFixture({
      accountExternalId: "17890000000000999",
      commentId: "captured-sanitized-comment",
      commentText: "A sanitized captured delivery",
      commenterExternalId: "captured-sanitized-author",
      mediaId: "captured-sanitized-media",
    })

    const result = await runAutomationSimulation({
      scenario: "happy_path",
      webhookBody: fixture,
    })

    expect(result.passed).toBe(true)
    expect(result.fixtureEventKey).toContain("captured-sanitized-comment")
  })
})

describe("automation simulation CLI arguments", () => {
  it("defaults to the full suite", () => {
    expect(parseAutomationSimulationArguments([])).toEqual({
      scenario: "all",
      fixturePath: undefined,
    })
  })

  it("accepts one scenario and a fixture path", () => {
    expect(parseAutomationSimulationArguments([
      "--scenario",
      "provider_outage",
      "--fixture=tests/fixtures/webhooks/meta-instagram-comment.json",
    ])).toEqual({
      scenario: "provider_outage",
      fixturePath: "tests/fixtures/webhooks/meta-instagram-comment.json",
    })
  })

  it("rejects unknown scenarios", () => {
    expect(() => parseAutomationSimulationArguments([
      "--scenario",
      "live-provider",
    ])).toThrow(/Unknown simulation scenario/)
  })
})
