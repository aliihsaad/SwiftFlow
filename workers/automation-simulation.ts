import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  AUTOMATION_SIMULATION_SCENARIOS,
  runAutomationSimulation,
  runAutomationSimulationSuite,
  type AutomationSimulationScenario,
} from "../lib/automation/automation-simulation"

interface SimulationCliOptions {
  scenario: AutomationSimulationScenario | "all"
  fixturePath?: string
}

function optionValue(argumentsList: string[], name: string): string | undefined {
  const inline = argumentsList.find((argument) => argument.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)

  const index = argumentsList.indexOf(name)
  return index >= 0 ? argumentsList[index + 1] : undefined
}

function isScenario(value: string): value is AutomationSimulationScenario {
  return (AUTOMATION_SIMULATION_SCENARIOS as readonly string[]).includes(value)
}

export function parseAutomationSimulationArguments(
  argumentsList: string[],
): SimulationCliOptions {
  const requestedScenario = optionValue(argumentsList, "--scenario") || "all"
  if (requestedScenario !== "all" && !isScenario(requestedScenario)) {
    throw new Error(
      `Unknown simulation scenario "${requestedScenario}". Expected all or one of: ${
        AUTOMATION_SIMULATION_SCENARIOS.join(", ")
      }`,
    )
  }

  const fixturePath = optionValue(argumentsList, "--fixture")?.trim()
  return {
    scenario: requestedScenario,
    fixturePath: fixturePath || undefined,
  }
}

async function loadFixture(
  fixturePath: string | undefined,
): Promise<Record<string, unknown> | undefined> {
  if (!fixturePath) return undefined

  const absolutePath = resolve(fixturePath)
  const parsed: unknown = JSON.parse(await readFile(absolutePath, "utf8"))
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Simulation fixture must contain one JSON object")
  }
  return parsed as Record<string, unknown>
}

export async function runAutomationSimulationCli(
  argumentsList = process.argv.slice(2),
): Promise<number> {
  const options = parseAutomationSimulationArguments(argumentsList)
  const webhookBody = await loadFixture(options.fixturePath)
  const result = options.scenario === "all"
    ? await runAutomationSimulationSuite({ webhookBody })
    : await runAutomationSimulation({
        scenario: options.scenario,
        webhookBody,
      })

  console.info(JSON.stringify(result, null, 2))
  return result.passed ? 0 : 1
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  if (!entryPath) return false
  return resolve(entryPath) === fileURLToPath(import.meta.url)
}

if (isDirectExecution()) {
  runAutomationSimulationCli()
    .then((exitCode) => {
      process.exitCode = exitCode
    })
    .catch((error) => {
      console.error("[AUTOMATION_SIMULATION] Failed", {
        message: error instanceof Error ? error.message : "Unknown simulation failure",
      })
      process.exitCode = 1
    })
}
