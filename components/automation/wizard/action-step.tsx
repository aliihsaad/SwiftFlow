"use client"

import type { Dispatch, SetStateAction } from "react"
import { Check, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type {
  AutomationWizardState,
  WizardActionConfig,
  WizardActionType,
  WizardAiConfig,
  WizardDelayConfig,
} from "@/lib/automation-wizard/types"

const ACTION_OPTIONS: Array<{
  type: WizardActionType
  label: string
  description: string
}> = [
  {
    type: "action_ai_response",
    label: "AI response",
    description: "Generate response text before the next action.",
  },
  {
    type: "action_reply_comment",
    label: "Reply to comment",
    description: "Post a public reply on the triggering comment.",
  },
  {
    type: "action_send_dm",
    label: "Send DM",
    description: "Send a direct message to the person who triggered this.",
  },
  {
    type: "action_private_reply",
    label: "Private reply",
    description: "Reply privately to a comment trigger.",
  },
  {
    type: "action_delay",
    label: "Delay",
    description: "Wait before continuing the automation.",
  },
  {
    type: "action_condition",
    label: "Condition",
    description: "Check a simple rule before later steps run.",
  },
  {
    type: "action_send_email",
    label: "Send email",
    description: "Send an internal alert or notification email.",
  },
  {
    type: "action_http_request",
    label: "HTTP request",
    description: "Call an external webhook or API endpoint.",
  },
]

const ACTION_LABEL_MAP: Record<WizardActionType, string> = ACTION_OPTIONS.reduce(
  (acc, option) => {
    acc[option.type] = option.label
    return acc
  },
  {} as Record<WizardActionType, string>,
)

function defaultActionConfig(type: WizardActionType): WizardActionConfig {
  switch (type) {
    case "action_ai_response":
      return { type, enabled: true }
    case "action_reply_comment":
      return { type, enabled: true, messages: ["Thanks for your comment."] }
    case "action_send_dm":
      return { type, enabled: true, openingMessage: "Thanks for reaching out." }
    case "action_private_reply":
      return { type, enabled: true, message: "Thanks for your comment." }
    case "action_delay":
      return { type, enabled: true }
    case "action_condition":
      return {
        type,
        enabled: true,
        conditionType: "keyword_match",
        conditionOperator: "contains",
        conditionKeywords: [],
      }
    case "action_send_email":
      return {
        type,
        enabled: true,
        recipientEmail: "",
        emailSubject: "Automation alert",
        emailBody: "An automation event was triggered.",
      }
    case "action_http_request":
      return { type, enabled: true, httpMethod: "POST", httpUrl: "", httpHeaders: {} }
  }
}

function hasAction(actions: WizardActionConfig[], type: WizardActionType): boolean {
  return actions.some((action) => action.type === type && action.enabled)
}

function isActionSelected(state: AutomationWizardState, type: WizardActionType): boolean {
  if (type === "action_ai_response") return state.ai.enabled
  if (type === "action_delay") return state.delay.enabled
  return hasAction(state.actions, type)
}

type SetWizardState = Dispatch<SetStateAction<AutomationWizardState>>

function updateAction(
  setState: SetWizardState,
  type: WizardActionType,
  patch: Partial<WizardActionConfig>,
) {
  setState((current) => ({
    ...current,
    actions: current.actions.map((action) =>
      action.type === type ? { ...action, ...patch } : action,
    ),
  }))
}

function updateAi(setState: SetWizardState, patch: Partial<WizardAiConfig>) {
  setState((current) => ({ ...current, ai: { ...current.ai, ...patch } }))
}

function updateDelay(setState: SetWizardState, patch: Partial<WizardDelayConfig>) {
  setState((current) => ({ ...current, delay: { ...current.delay, ...patch } }))
}

function findAction(
  state: AutomationWizardState,
  type: WizardActionType,
): WizardActionConfig | undefined {
  return state.actions.find((action) => action.type === type)
}

export function ActionStep({
  state,
  setState,
}: {
  state: AutomationWizardState
  setState: SetWizardState
}) {
  const selectedCount =
    state.actions.filter((action) => action.enabled).length +
    (state.ai.enabled && !hasAction(state.actions, "action_ai_response") ? 1 : 0) +
    (state.delay.enabled && !hasAction(state.actions, "action_delay") ? 1 : 0)

  const enabledActionTypes = ACTION_OPTIONS.map((option) => option.type).filter((type) =>
    isActionSelected(state, type),
  )

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white/85">Actions</h3>
          <p className="text-xs leading-relaxed text-white/45">
            Pick what should happen, then configure each one.
          </p>
        </div>
        <div className="text-xs font-semibold text-white/45">{selectedCount} selected</div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {ACTION_OPTIONS.map((option) => {
          const isSelected = isActionSelected(state, option.type)

          return (
            <button
              key={option.type}
              type="button"
              onClick={() =>
                setState((current) => {
                  const nextSelected =
                    option.type === "action_ai_response"
                      ? !current.ai.enabled
                      : option.type === "action_delay"
                        ? !current.delay.enabled
                        : !hasAction(current.actions, option.type)

                  const existingAction = current.actions.find((action) => action.type === option.type)
                  const nextActions = existingAction
                    ? current.actions.map((action) =>
                        action.type === option.type ? { ...action, enabled: nextSelected } : action,
                      )
                    : [...current.actions, defaultActionConfig(option.type)]

                  return {
                    ...current,
                    ai:
                      option.type === "action_ai_response"
                        ? { ...current.ai, enabled: nextSelected }
                        : current.ai,
                    delay:
                      option.type === "action_delay"
                        ? { ...current.delay, enabled: nextSelected }
                        : current.delay,
                    actions: nextActions,
                  }
                })
              }
              className={cn(
                "rounded-lg border p-3 text-left transition hover:border-white/25 hover:bg-white/[0.06]",
                isSelected
                  ? "border-violet-400/50 bg-violet-500/15"
                  : "border-white/10 bg-white/[0.03]",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white/90">{option.label}</div>
                  <div className="mt-1 text-xs leading-relaxed text-white/45">
                    {option.description}
                  </div>
                </div>
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                    isSelected
                      ? "border-violet-300 bg-violet-400 text-[#080912]"
                      : "border-white/20 text-white/30",
                  )}
                >
                  {isSelected ? <Check className="h-3 w-3" /> : null}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {enabledActionTypes.length > 0 ? (
        <div className="space-y-3">
          {enabledActionTypes.map((type) => (
            <ActionDetailCard
              key={type}
              type={type}
              state={state}
              setState={setState}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-white/45">
          Pick at least one action to continue.
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            setState((current) => ({
              ...current,
              ai: { ...current.ai, enabled: false },
              delay: { ...current.delay, enabled: false },
              actions: current.actions.map((action) => ({ ...action, enabled: false })),
            }))
          }
        >
          Clear actions
        </Button>
      </div>
    </div>
  )
}

function ActionDetailCard({
  type,
  state,
  setState,
}: {
  type: WizardActionType
  state: AutomationWizardState
  setState: SetWizardState
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 sm:p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
        {ACTION_LABEL_MAP[type]}
      </div>
      <div className="mt-3 space-y-3">
        <ActionDetailFields type={type} state={state} setState={setState} />
      </div>
    </div>
  )
}

function ActionDetailFields({
  type,
  state,
  setState,
}: {
  type: WizardActionType
  state: AutomationWizardState
  setState: SetWizardState
}) {
  switch (type) {
    case "action_ai_response":
      return <AiFields state={state} setState={setState} />
    case "action_delay":
      return <DelayFields state={state} setState={setState} />
    case "action_reply_comment":
      return (
        <ReplyCommentFields
          action={findAction(state, type)}
          setState={setState}
          aiAvailable={state.ai.enabled}
        />
      )
    case "action_send_dm":
      return (
        <SendDmFields
          action={findAction(state, type)}
          setState={setState}
          aiAvailable={state.ai.enabled}
        />
      )
    case "action_private_reply":
      return (
        <PrivateReplyFields
          action={findAction(state, type)}
          setState={setState}
          aiAvailable={state.ai.enabled}
        />
      )
    case "action_send_email":
      return <SendEmailFields action={findAction(state, type)} setState={setState} />
    case "action_http_request":
      return <HttpRequestFields action={findAction(state, type)} setState={setState} />
    case "action_condition":
      return <ConditionFields action={findAction(state, type)} setState={setState} />
  }
}

function UseAiResponseToggle({
  action,
  setState,
  type,
}: {
  action: WizardActionConfig
  setState: SetWizardState
  type: WizardActionType
}) {
  const enabled = action.useAiResponse === true
  return (
    <div className="rounded-md border border-violet-400/25 bg-violet-500/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-xs font-semibold text-white/85">Use AI response</Label>
          <p className="text-[11px] leading-relaxed text-white/55">
            Insert the AI-generated reply instead of writing your own message.
          </p>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) =>
            updateAction(setState, type, { useAiResponse: event.target.checked })
          }
          className="h-4 w-4 accent-violet-400"
        />
      </div>
    </div>
  )
}

const AI_TONES: Array<{ value: WizardAiConfig["tone"]; label: string }> = [
  { value: "friendly", label: "Friendly" },
  { value: "professional", label: "Professional" },
  { value: "playful", label: "Playful" },
  { value: "empathetic", label: "Empathetic" },
  { value: "sales", label: "Sales" },
]

const AI_LENGTHS: Array<{ value: WizardAiConfig["length"]; label: string }> = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
]

const AI_EMOJI_LEVELS: Array<{ value: WizardAiConfig["emojiLevel"]; label: string }> = [
  { value: "none", label: "None" },
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
]

const AI_GOALS: Array<{ value: WizardAiConfig["presetGoal"]; label: string }> = [
  { value: "auto", label: "Auto by trigger" },
  { value: "reply_comment", label: "Reply to comment" },
  { value: "send_dm", label: "Send DM" },
  { value: "welcome_new_follower", label: "Welcome follower" },
  { value: "support_answer", label: "Support answer" },
]

function selectClass(): string {
  return "mt-1 w-full appearance-none rounded-md border border-white/10 bg-[#1a1b26] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-violet-400/50 [&>option]:bg-[#1a1b26] [&>option]:text-white"
}

function inputClass(): string {
  return "bg-white/[0.04] text-white placeholder:text-white/30"
}

function AiFields({ state, setState }: { state: AutomationWizardState; setState: SetWizardState }) {
  const ai = state.ai
  return (
    <>
      <div>
        <Label className="text-xs text-white/55">Reply goal</Label>
        <select
          value={ai.presetGoal}
          onChange={(event) => updateAi(setState, { presetGoal: event.target.value as WizardAiConfig["presetGoal"] })}
          className={selectClass()}
        >
          {AI_GOALS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-white/55">Tone</Label>
          <select
            value={ai.tone}
            onChange={(event) => updateAi(setState, { tone: event.target.value as WizardAiConfig["tone"] })}
            className={selectClass()}
          >
            {AI_TONES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs text-white/55">Length</Label>
          <select
            value={ai.length}
            onChange={(event) => updateAi(setState, { length: event.target.value as WizardAiConfig["length"] })}
            className={selectClass()}
          >
            {AI_LENGTHS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Label className="text-xs text-white/55">Emoji level</Label>
        <select
          value={ai.emojiLevel}
          onChange={(event) => updateAi(setState, { emojiLevel: event.target.value as WizardAiConfig["emojiLevel"] })}
          className={selectClass()}
        >
          {AI_EMOJI_LEVELS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div>
        <Label className="text-xs text-white/55">Extra instructions (optional)</Label>
        <Textarea
          value={ai.customInstructions}
          onChange={(event) => updateAi(setState, { customInstructions: event.target.value })}
          placeholder="e.g. mention our free trial."
          className={cn("mt-1", inputClass())}
          rows={2}
        />
      </div>

      <p className="rounded-md bg-white/[0.03] p-2 text-[11px] leading-relaxed text-white/40">
        Uses your workspace AI provider. Other actions can include the generated reply automatically.
      </p>
    </>
  )
}

function DelayFields({ state, setState }: { state: AutomationWizardState; setState: SetWizardState }) {
  const delay = state.delay
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label className="text-xs text-white/55">Duration</Label>
        <Input
          type="number"
          min={1}
          value={delay.durationValue}
          onChange={(event) =>
            updateDelay(setState, { durationValue: parseInt(event.target.value, 10) || 1 })
          }
          className={cn("mt-1", inputClass())}
        />
      </div>
      <div>
        <Label className="text-xs text-white/55">Unit</Label>
        <select
          value={delay.durationUnit}
          onChange={(event) =>
            updateDelay(setState, { durationUnit: event.target.value as WizardDelayConfig["durationUnit"] })
          }
          className={selectClass()}
        >
          <option value="seconds">Seconds</option>
          <option value="minutes">Minutes</option>
          <option value="hours">Hours</option>
          <option value="days">Days</option>
        </select>
      </div>
    </div>
  )
}

function ReplyCommentFields({
  action,
  setState,
  aiAvailable,
}: {
  action: WizardActionConfig | undefined
  setState: SetWizardState
  aiAvailable: boolean
}) {
  if (!action) return null
  const messages = action.messages?.length ? action.messages : [""]
  const usingAi = aiAvailable && action.useAiResponse === true

  const updateMessages = (next: string[]) =>
    updateAction(setState, "action_reply_comment", { messages: next })

  return (
    <div className="space-y-2">
      {aiAvailable ? (
        <UseAiResponseToggle action={action} setState={setState} type="action_reply_comment" />
      ) : null}
      {usingAi ? (
        <p className="rounded-md bg-white/[0.03] p-2 text-[11px] leading-relaxed text-white/45">
          The generated AI reply will be posted on the comment.
        </p>
      ) : (
        <>
      <Label className="text-xs text-white/55">Reply messages (random pick)</Label>
      {messages.map((message, index) => (
        <div key={index} className="flex gap-1">
          <Input
            value={message}
            onChange={(event) => {
              const next = [...messages]
              next[index] = event.target.value
              updateMessages(next)
            }}
            placeholder={`Reply ${index + 1}`}
            className={inputClass()}
          />
          {messages.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => updateMessages(messages.filter((_, j) => j !== index))}
            >
              <X className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => updateMessages([...messages, ""])}
      >
        <Plus className="mr-1 h-3 w-3" /> Add reply
      </Button>
        </>
      )}
    </div>
  )
}

function SendDmFields({
  action,
  setState,
  aiAvailable,
}: {
  action: WizardActionConfig | undefined
  setState: SetWizardState
  aiAvailable: boolean
}) {
  if (!action) return null
  const fallbackEnabled = action.fallbackToPrivateReplyOnFailure === true
  const usingAi = aiAvailable && action.useAiResponse === true

  return (
    <>
      {aiAvailable ? (
        <UseAiResponseToggle action={action} setState={setState} type="action_send_dm" />
      ) : null}
      {usingAi ? (
        <p className="rounded-md bg-white/[0.03] p-2 text-[11px] leading-relaxed text-white/45">
          The generated AI reply will be sent as the DM opening message.
        </p>
      ) : (
        <div>
          <Label className="text-xs text-white/55">Opening message</Label>
          <Textarea
            value={action.openingMessage || ""}
            onChange={(event) =>
              updateAction(setState, "action_send_dm", { openingMessage: event.target.value })
            }
            placeholder="Hey! Thanks for your comment..."
            className={cn("mt-1", inputClass())}
            rows={3}
          />
        </div>
      )}
      <div>
        <Label className="text-xs text-white/55">CTA button text (optional)</Label>
        <Input
          value={action.buttonText || ""}
          onChange={(event) =>
            updateAction(setState, "action_send_dm", { buttonText: event.target.value })
          }
          placeholder="Get the link"
          className={inputClass()}
        />
      </div>
      <div>
        <Label className="text-xs text-white/55">CTA link URL (optional)</Label>
        <Input
          value={action.linkUrl || ""}
          onChange={(event) =>
            updateAction(setState, "action_send_dm", { linkUrl: event.target.value })
          }
          placeholder="https://..."
          className={inputClass()}
        />
      </div>
      <div>
        <Label className="text-xs text-white/55">CTA context (optional)</Label>
        <Input
          value={action.linkMessage || ""}
          onChange={(event) =>
            updateAction(setState, "action_send_dm", { linkMessage: event.target.value })
          }
          placeholder="Tap below to continue"
          className={inputClass()}
        />
      </div>
      <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs text-white/80">Fallback to private reply on failure</Label>
            <p className="text-[11px] text-white/45">
              If a DM cannot be sent (window closed, blocked), reply privately instead.
            </p>
          </div>
          <input
            type="checkbox"
            checked={fallbackEnabled}
            onChange={(event) =>
              updateAction(setState, "action_send_dm", {
                fallbackToPrivateReplyOnFailure: event.target.checked,
              })
            }
            className="h-4 w-4 accent-violet-400"
          />
        </div>
        {fallbackEnabled ? (
          <div className="mt-2">
            <Label className="text-xs text-white/55">Fallback message (optional)</Label>
            <Textarea
              value={action.fallbackMessage || ""}
              onChange={(event) =>
                updateAction(setState, "action_send_dm", { fallbackMessage: event.target.value })
              }
              placeholder="If empty, opening message + link will be used."
              className={cn("mt-1", inputClass())}
              rows={2}
            />
          </div>
        ) : null}
      </div>
    </>
  )
}

function PrivateReplyFields({
  action,
  setState,
  aiAvailable,
}: {
  action: WizardActionConfig | undefined
  setState: SetWizardState
  aiAvailable: boolean
}) {
  if (!action) return null
  const usingAi = aiAvailable && action.useAiResponse === true
  return (
    <div className="space-y-2">
      {aiAvailable ? (
        <UseAiResponseToggle action={action} setState={setState} type="action_private_reply" />
      ) : null}
      {usingAi ? (
        <p className="rounded-md bg-white/[0.03] p-2 text-[11px] leading-relaxed text-white/45">
          The generated AI reply will be sent as the private reply.
        </p>
      ) : (
        <>
          <Label className="text-xs text-white/55">Private reply message</Label>
          <Textarea
            value={action.message || ""}
            onChange={(event) =>
              updateAction(setState, "action_private_reply", { message: event.target.value })
            }
            placeholder="Thanks! Check your inbox."
            className={cn("mt-1", inputClass())}
            rows={3}
          />
        </>
      )}
      <p className="text-[11px] text-white/40">
        Requires a comment trigger and will fail on non-comment triggers.
      </p>
    </div>
  )
}

function SendEmailFields({
  action,
  setState,
}: {
  action: WizardActionConfig | undefined
  setState: SetWizardState
}) {
  if (!action) return null
  return (
    <>
      <div>
        <Label className="text-xs text-white/55">Recipient email</Label>
        <Input
          type="email"
          value={action.recipientEmail || ""}
          onChange={(event) =>
            updateAction(setState, "action_send_email", { recipientEmail: event.target.value })
          }
          placeholder="alerts@company.com"
          className={inputClass()}
        />
      </div>
      <div>
        <Label className="text-xs text-white/55">Subject</Label>
        <Input
          value={action.emailSubject || ""}
          onChange={(event) =>
            updateAction(setState, "action_send_email", { emailSubject: event.target.value })
          }
          className={inputClass()}
        />
      </div>
      <div>
        <Label className="text-xs text-white/55">Body</Label>
        <Textarea
          value={action.emailBody || ""}
          onChange={(event) =>
            updateAction(setState, "action_send_email", { emailBody: event.target.value })
          }
          rows={4}
          className={cn("mt-1", inputClass())}
        />
      </div>
    </>
  )
}

function HttpRequestFields({
  action,
  setState,
}: {
  action: WizardActionConfig | undefined
  setState: SetWizardState
}) {
  if (!action) return null
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs text-white/55">Method</Label>
          <select
            value={action.httpMethod || "POST"}
            onChange={(event) =>
              updateAction(setState, "action_http_request", {
                httpMethod: event.target.value as WizardActionConfig["httpMethod"],
              })
            }
            className={selectClass()}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-white/55">URL</Label>
          <Input
            value={action.httpUrl || ""}
            onChange={(event) =>
              updateAction(setState, "action_http_request", { httpUrl: event.target.value })
            }
            placeholder="https://api.example.com/..."
            className={inputClass()}
          />
        </div>
      </div>
      <div>
        <Label className="text-xs text-white/55">Body (JSON)</Label>
        <Textarea
          value={action.httpBody || ""}
          onChange={(event) =>
            updateAction(setState, "action_http_request", { httpBody: event.target.value })
          }
          rows={4}
          className={cn("mt-1 font-mono text-xs", inputClass())}
        />
      </div>
    </>
  )
}

function ConditionFields({
  action,
  setState,
}: {
  action: WizardActionConfig | undefined
  setState: SetWizardState
}) {
  if (!action) return null
  const conditionType = action.conditionType || "keyword_match"
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-white/55">Type</Label>
          <select
            value={conditionType}
            onChange={(event) =>
              updateAction(setState, "action_condition", {
                conditionType: event.target.value as WizardActionConfig["conditionType"],
              })
            }
            className={selectClass()}
          >
            <option value="keyword_match">Keyword match</option>
            <option value="follower_count">Follower count</option>
            <option value="comment_count">Comment count</option>
          </select>
        </div>
        <div>
          <Label className="text-xs text-white/55">Operator</Label>
          <select
            value={action.conditionOperator || "contains"}
            onChange={(event) =>
              updateAction(setState, "action_condition", {
                conditionOperator: event.target.value as WizardActionConfig["conditionOperator"],
              })
            }
            className={selectClass()}
          >
            <option value="contains">Contains</option>
            <option value="not_contains">Does not contain</option>
            <option value="equals">Equals</option>
            <option value="greater_than">Greater than</option>
            <option value="less_than">Less than</option>
          </select>
        </div>
      </div>

      {conditionType === "keyword_match" ? (
        <div>
          <Label className="text-xs text-white/55">Keywords (comma separated)</Label>
          <Input
            value={(action.conditionKeywords || []).join(", ")}
            onChange={(event) =>
              updateAction(setState, "action_condition", {
                conditionKeywords: event.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            }
            className={inputClass()}
          />
        </div>
      ) : (
        <div>
          <Label className="text-xs text-white/55">Threshold</Label>
          <Input
            type="number"
            value={action.conditionThreshold ?? 0}
            onChange={(event) =>
              updateAction(setState, "action_condition", {
                conditionThreshold: parseInt(event.target.value, 10) || 0,
              })
            }
            className={inputClass()}
          />
        </div>
      )}
    </>
  )
}
