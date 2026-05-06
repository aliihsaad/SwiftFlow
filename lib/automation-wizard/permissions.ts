import type {
  AutomationWizardPlatform,
  AutomationWizardState,
  WizardActionType,
  WizardTriggerType,
} from "./types"

export interface WizardPermissionRequirement {
  permission: string
  reason: string
  platform: AutomationWizardPlatform
}

function triggerPermissions(
  triggerType: WizardTriggerType,
  platform: AutomationWizardPlatform,
): WizardPermissionRequirement[] {
  if (triggerType === "trigger_new_comment") {
    return platform === "facebook"
      ? [
          {
            permission: "pages_read_engagement",
            platform,
            reason: "Read Facebook Page comments for comment triggers.",
          },
        ]
      : [
          {
            permission: "instagram_manage_comments",
            platform,
            reason: "Read Instagram comments for comment triggers.",
          },
        ]
  }

  if (triggerType === "trigger_new_message") {
    return platform === "facebook"
      ? [
          {
            permission: "pages_messaging",
            platform,
            reason: "Read Facebook Page conversations and messages.",
          },
        ]
      : [
          {
            permission: "instagram_manage_messages",
            platform,
            reason: "Read Instagram messages.",
          },
        ]
  }

  return []
}

function actionPermissions(
  actionType: WizardActionType,
  platform: AutomationWizardPlatform,
): WizardPermissionRequirement[] {
  if (actionType === "action_reply_comment") {
    return platform === "facebook"
      ? [
          {
            permission: "pages_manage_engagement",
            platform,
            reason: "Reply to or manage Facebook Page comments.",
          },
        ]
      : [
          {
            permission: "instagram_manage_comments",
            platform,
            reason: "Reply to Instagram comments.",
          },
        ]
  }

  if (actionType === "action_send_dm" || actionType === "action_private_reply") {
    return platform === "facebook"
      ? [
          {
            permission: "pages_messaging",
            platform,
            reason: "Send Facebook Page messages or private replies.",
          },
        ]
      : [
          {
            permission: "instagram_manage_messages",
            platform,
            reason: "Send Instagram messages or private replies.",
          },
        ]
  }

  return []
}

export function getWizardPermissionRequirements(
  state: AutomationWizardState,
): WizardPermissionRequirement[] {
  const requirements = [
    ...triggerPermissions(state.triggerType, state.account.platform),
    ...state.actions.flatMap((action) =>
      action.enabled ? actionPermissions(action.type, state.account.platform) : [],
    ),
  ]

  const byPermission = new Map<string, WizardPermissionRequirement>()
  for (const requirement of requirements) {
    byPermission.set(`${requirement.platform}:${requirement.permission}`, requirement)
  }

  return Array.from(byPermission.values())
}
