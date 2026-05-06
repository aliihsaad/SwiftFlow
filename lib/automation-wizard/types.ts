import type {
  ActionNodeType,
  TriggerNodeType,
  WorkflowNodeType,
} from "@/types/automation-graph"

export type AutomationWizardFamily = "publishing" | "engagement"
export type AutomationWizardPlatform = "instagram" | "facebook"
export type AutomationWizardMode = "draft" | "active"

export type WizardTriggerType = TriggerNodeType
export type WizardActionType = ActionNodeType

export interface WizardAccountSelection {
  socialAccountId: string
  platform: AutomationWizardPlatform
  accountName?: string
}

export interface WizardTargetSelection {
  postId?: string
  postThumbnailUrl?: string
  postCaption?: string
}

export interface WizardFilterConfig {
  triggerType: "any" | "keywords"
  keywords: string[]
}

export interface WizardAiConfig {
  enabled: boolean
  useGlobalSettings: boolean
  presetGoal: "auto" | "reply_comment" | "send_dm" | "welcome_new_follower" | "support_answer"
  tone: "friendly" | "professional" | "playful" | "empathetic" | "sales"
  length: "short" | "medium" | "long"
  emojiLevel: "none" | "light" | "medium" | "high"
  customInstructions: string
}

export interface WizardDelayConfig {
  enabled: boolean
  durationValue: number
  durationUnit: "seconds" | "minutes" | "hours" | "days"
}

export interface WizardActionConfig {
  type: WizardActionType
  enabled: boolean
  message?: string
  messages?: string[]
  openingMessage?: string
  buttonText?: string
  linkUrl?: string
  linkMessage?: string
  fallbackToPrivateReplyOnFailure?: boolean
  fallbackMessage?: string
  recipientEmail?: string
  emailSubject?: string
  emailBody?: string
  httpMethod?: "GET" | "POST" | "PUT" | "DELETE"
  httpUrl?: string
  httpHeaders?: Record<string, string>
  httpBody?: string
  conditionType?: "keyword_match" | "follower_count" | "comment_count"
  conditionOperator?: "contains" | "not_contains" | "equals" | "greater_than" | "less_than"
  conditionKeywords?: string[]
  conditionThreshold?: number
}

export interface AutomationWizardState {
  name: string
  family: AutomationWizardFamily
  mode: AutomationWizardMode
  triggerType: WizardTriggerType
  account: WizardAccountSelection
  target: WizardTargetSelection
  filters: WizardFilterConfig
  ai: WizardAiConfig
  delay: WizardDelayConfig
  actions: WizardActionConfig[]
}

export interface WizardValidationIssue {
  field: string
  message: string
  severity: "error" | "warning"
}

export interface WizardCompileResult {
  graphNodeTypes: WorkflowNodeType[]
  warnings: WizardValidationIssue[]
}
