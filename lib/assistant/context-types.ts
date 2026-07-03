import type {
  AssistantAction,
  AssistantConfidence,
  AssistantFunctionName,
  AssistantMode,
} from "@/app/dashboard/assistant/assistant-types"
import type { AnalyticsReadThroughSyncResult } from "@/lib/analytics/read-through-sync"
import type { AssistantSurface } from "@/lib/assistant/capabilities"

export type AssistantContextKind = "brand" | "content" | "analytics" | "automations" | "accounts"

export interface AssistantSelectedContext {
  postId?: string
  draftId?: string
  analyticsRange?: "7d" | "30d" | "90d"
  automationId?: string
}

export interface AssistantCommandMessage {
  role: "user" | "assistant"
  content: string
  type?: string
  data?: unknown
  images?: Array<{ base64: string; mimeType: string; name?: string }>
}

export interface AssistantCommandRequest {
  message: string
  messages: AssistantCommandMessage[]
  mode: AssistantMode
  action: AssistantAction
  functionName: AssistantFunctionName
  confidence: AssistantConfidence
  needsClarification: boolean
  workspaceId?: string
  selectedContext?: AssistantSelectedContext
  surface?: AssistantSurface
}

export interface AssistantBrandContext {
  businessName: string
  industry: string
  brandVoice: string
  language: string
  targetAudience: string
  businessDescription: string
  services: string[]
  uniqueSellingPoints: string[]
  contentThemes: string[]
  brandColors?: {
    enabled?: boolean
    primary?: string
    secondary?: string
    accent?: string
  }
}

export interface AssistantPostContextItem {
  id: string
  status: string
  content: string
  platforms: string[]
  mediaCount: number
  scheduledFor: string | null
  publishedAt: string | null
  updatedAt: string | null
}

export interface AssistantAnalyticsContext {
  range: "7d" | "30d" | "90d"
  totals: {
    views: number
    likes: number
    comments: number
    shares: number
    saves: number
    publishedPosts: number
    connectedAccounts: number
  }
  topPosts: Array<{
    publishedPostId: string
    platform: string
    publishedAt: string | null
    views: number
    likes: number
    comments: number
    shares: number
    saves: number
    score: number
  }>
  sync: AnalyticsReadThroughSyncResult
}

export interface AssistantAutomationContextItem {
  id: string
  name: string
  type: string
  isActive: boolean
  totalTriggered: number
  totalDmsSent: number
  updatedAt: string | null
}

export interface AssistantAccountContextItem {
  id: string
  platform: "instagram" | "facebook"
  accountName: string
  accountId: string
  connected: boolean
  capabilities: {
    analyticsRead?: boolean
    comments?: boolean
    messages?: boolean
    publishing?: boolean
  }
}

export interface AssistantContextPack {
  requestedKinds: AssistantContextKind[]
  brand?: AssistantBrandContext
  content?: {
    recentPosts: AssistantPostContextItem[]
    selectedPost?: AssistantPostContextItem
  }
  analytics?: AssistantAnalyticsContext
  automations?: {
    activeCount: number
    items: AssistantAutomationContextItem[]
  }
  accounts?: {
    connectedCount: number
    items: AssistantAccountContextItem[]
  }
  generatedAt: string
  warnings: string[]
}

export interface AssistantContextReceipt {
  label: string
  packs: AssistantContextKind[]
  warnings: string[]
  analyticsSyncReason?: string
}

export interface AssistantCommandResponse {
  data: unknown
  assistantIntent: {
    mode: AssistantMode
    action: AssistantAction
    confidence: AssistantConfidence
  }
  assistantContext: AssistantContextPack
  contextReceipt: AssistantContextReceipt
}
