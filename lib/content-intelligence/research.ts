import { fallbackEvidence } from "./evidence"
import type { IntelligenceEvidence, ResearchFinding } from "./types"

export interface ResearchRequest {
  workspaceId: string
  topic: string
  platform?: "instagram" | "facebook" | "all"
  provider?: "openrouter" | "gemini" | "openai"
}

export interface ResearchResult {
  findings: ResearchFinding[]
  evidence: IntelligenceEvidence[]
  unavailableReason?: string
}

export async function researchContentTopic(request: ResearchRequest): Promise<ResearchResult> {
  return {
    findings: [],
    evidence: [
      fallbackEvidence(
        `Live trend research for "${request.topic}" is provider-neutral by design and will be enabled after the local scoring flow is stable.`,
        "low",
      ),
    ],
    unavailableReason: "research_provider_not_configured",
  }
}
