export const SUPPORTED_AUTOMATION_CONDITION_TYPES = [
  'keyword_match',
] as const

export const TEMP_DISABLED_AUTOMATION_CONDITION_TYPES = [
  'follower_count',
  'comment_count',
] as const

export type AutomationConditionPolicyIssue = {
  code: 'MISSING_FIELD' | 'CONDITION_TEMPORARILY_DISABLED' | 'UNSUPPORTED_CONDITION'
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
