export const SUPPORTED_AUTOMATION_CONDITION_TYPES = [
  'keyword_match',
  'instagram_follower_status',
] as const

export const INSTAGRAM_FOLLOWER_STATUS_TRIGGER_TYPES = [
  'trigger_new_message',
  'trigger_story_reply',
] as const

export const TEMP_DISABLED_AUTOMATION_CONDITION_TYPES = [
  'follower_count',
  'comment_count',
] as const

export type AutomationConditionPolicyIssue = {
  code:
    | 'MISSING_FIELD'
    | 'CONDITION_TEMPORARILY_DISABLED'
    | 'UNSUPPORTED_CONDITION'
    | 'FOLLOWER_STATUS_REQUIRES_MESSAGING_TRIGGER'
  message: string
}

const supportedConditionTypes = new Set<string>(SUPPORTED_AUTOMATION_CONDITION_TYPES)
const disabledConditionTypes = new Set<string>(TEMP_DISABLED_AUTOMATION_CONDITION_TYPES)

function conditionLabel(conditionType: string): string {
  return conditionType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getAutomationConditionPolicyIssue(
  value: unknown,
): AutomationConditionPolicyIssue | null {
  const conditionType = typeof value === 'string' ? value.trim() : ''

  if (!conditionType) {
    return {
      code: 'MISSING_FIELD',
      message: 'Condition requires condition_type.',
    }
  }

  if (disabledConditionTypes.has(conditionType)) {
    return {
      code: 'CONDITION_TEMPORARILY_DISABLED',
      message: conditionLabel(conditionType) + ' is temporarily disabled until its runtime metric semantics are implemented and verified.',
    }
  }

  if (!supportedConditionTypes.has(conditionType)) {
    return {
      code: 'UNSUPPORTED_CONDITION',
      message: conditionLabel(conditionType) + ' is not a supported automation condition.',
    }
  }

  return null
}

export function getAutomationConditionTriggerPolicyIssue(
  conditionTypeValue: unknown,
  triggerTypeValue: unknown,
): AutomationConditionPolicyIssue | null {
  const conditionType =
    typeof conditionTypeValue === 'string' ? conditionTypeValue.trim() : ''
  const triggerType =
    typeof triggerTypeValue === 'string' ? triggerTypeValue.trim() : ''

  if (conditionType !== 'instagram_follower_status') return null

  if (
    INSTAGRAM_FOLLOWER_STATUS_TRIGGER_TYPES.includes(
      triggerType as (typeof INSTAGRAM_FOLLOWER_STATUS_TRIGGER_TYPES)[number],
    )
  ) {
    return null
  }

  return {
    code: 'FOLLOWER_STATUS_REQUIRES_MESSAGING_TRIGGER',
    message:
      'Instagram follower status requires a New Message or Story Reply trigger because Meta only exposes it after messaging consent.',
  }
}
