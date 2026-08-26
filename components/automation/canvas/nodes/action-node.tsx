"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { GitBranch, Globe, Info, MailPlus,
  MessageCircleMore,
  MessageSquare, Reply, Send, Sparkles, Timer,
} from "lucide-react"

import type { WorkflowNodeData } from "@/types/automation-graph"

const iconMap: Record<string, React.ElementType> = {
  action_send_dm: Send,
  action_private_reply: Reply,
  action_reply_comment: MessageSquare,
  action_delay: Timer,
  action_condition: GitBranch,
  action_send_email: MailPlus,
  action_telegram: MessageCircleMore,
  action_http_request: Globe,
  action_ai_response: Sparkles,
}

const colorMap: Record<string, { accent: string; border: string; selected: string; glow: string }> = {
  action_send_dm: { accent: "#f9a8d4", border: "rgba(249,168,212,.20)", selected: "rgba(249,168,212,.72)", glow: "rgba(249,168,212,.16)",
  },
  action_private_reply: { accent: "#f9a8d4", border: "rgba(249,168,212,.20)", selected: "rgba(249,168,212,.72)", glow: "rgba(249,168,212,.16)",
  },
  action_reply_comment: { accent: "#f9a8d4", border: "rgba(249,168,212,.20)", selected: "rgba(249,168,212,.72)", glow: "rgba(249,168,212,.16)",
  },
  action_delay: { accent: "#fcd34d", border: "rgba(252,211,77,.20)", selected: "rgba(252,211,77,.72)", glow: "rgba(252,211,77,.14)",
  },
  action_condition: { accent: "#6ee7b7", border: "rgba(110,231,183,.20)", selected: "rgba(110,231,183,.72)", glow: "rgba(110,231,183,.14)",
  },
  action_send_email: { accent: "#67e8f9", border: "rgba(103,232,249,.20)", selected: "rgba(103,232,249,.72)", glow: "rgba(103,232,249,.14)",
  },
  action_telegram: {
    accent: "#38bdf8",
    border: "rgba(56,189,248,.22)",
    selected: "rgba(56,189,248,.78)",
    glow: "rgba(56,189,248,.16)",
  },
  action_http_request: { accent: "#67e8f9", border: "rgba(103,232,249,.20)", selected: "rgba(103,232,249,.72)", glow: "rgba(103,232,249,.14)",
  },
  action_ai_response: { accent: "#c4b5fd", border: "rgba(196,181,253,.20)", selected: "rgba(196,181,253,.72)", glow: "rgba(196,181,253,.16)",
  },
}

function ActionNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData
  const Icon = iconMap[nodeData.type] || Send
  const colors = colorMap[nodeData.type] || colorMap.action_send_dm
  const config = nodeData.config as unknown as Record<string, unknown>
  const isCondition = nodeData.type === "action_condition"
  const isTelegramApproval =
    nodeData.type === "action_telegram" && config.mode === "approval"
  const isTelegramNotification =
    nodeData.type === "action_telegram" && !isTelegramApproval
  const supportsAlertOutput = !isCondition &&
    !isTelegramApproval &&
    !isTelegramNotification &&
    nodeData.type !== "action_send_email"
  const description = nodeData.description || getDescription(nodeData)

  return (
    <div
      className="relative w-[152px] overflow-hidden rounded-[14px] border shadow-[0_12px_30px_rgba(0,0,0,.28)] backdrop-blur-xl transition duration-150 sm:w-[208px] sm:rounded-2xl sm:shadow-[0_18px_44px_rgba(0,0,0,.3)]"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,.045), rgba(255,255,255,0) 48%), rgba(17,19,28,.97)",
        borderColor: selected ? colors.selected : colors.border,
        boxShadow: selected ? "0 18px 48px " + colors.glow + ", 0 0 0 3px " + colors.glow : undefined,
      }}
    >
      <span
        className="absolute inset-y-3 left-0 w-0.5 rounded-r-full"
        style={{ backgroundColor: colors.accent, boxShadow: "0 0 16px " + colors.glow }}
        aria-hidden="true"
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !border-2 !border-[#11131c] sm:!size-3.5 sm:!border-[3px]"
        style={{ background: colors.accent }}
      />

      <div className="p-2 pl-2.5 sm:p-3 sm:pl-3.5">
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-lg border sm:size-9 sm:rounded-xl"
            style={{ color: colors.accent, borderColor: colors.border, backgroundColor: colors.glow,
            }}
          >
            <Icon className="size-3.5 sm:size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="hidden text-[8px] font-bold uppercase tracking-[0.18em] text-white/28 sm:block">
              {isCondition ? "Decision" : nodeData.type === "action_ai_response" ? "Intelligence" : "Action"}
            </span>
            <p className="truncate text-[11px] font-semibold leading-4 text-white/90 sm:mt-0.5 sm:text-[13px]">{nodeData.label}</p>
          </div>
          <span
            title={getActionNodeHelp(nodeData)}
            className="grid size-5 shrink-0 place-items-center rounded-full border border-white/[0.07] bg-white/[0.025] text-white/28 sm:size-6"
            aria-label={nodeData.label + " help"}
          >
            <Info className="size-2.5 sm:size-3" aria-hidden="true" />
          </span>
        </div>
        <div className="mt-1.5 rounded-lg border border-white/[0.045] bg-black/10 px-2 py-1 sm:mt-2 sm:px-2.5 sm:py-1.5">
          <p className="line-clamp-1 text-[9px] leading-3.5 text-white/42 sm:line-clamp-2 sm:text-[10px] sm:leading-4">
            {description}
          </p>
        </div>
      </div>

      {isCondition ? (
        <div className="grid grid-cols-3 border-t border-white/[0.055] px-1.5 py-1.5 text-center text-[7px] font-semibold uppercase tracking-wider sm:px-3 sm:py-2 sm:text-[8px]">
          <span className="text-emerald-200/60">Yes</span>
          <span className="text-amber-200/60">Error</span>
          <span className="text-rose-200/60">No</span>
          <Handle type="source" position={Position.Bottom} id="true" className="!size-3 !border-2 !border-[#11131c] !bg-emerald-300 sm:!size-3.5 sm:!border-[3px]" style={{ left: "24%" }} />
          <Handle type="source" position={Position.Bottom} id="error" className="!size-3 !border-2 !border-[#11131c] !bg-amber-300 sm:!size-3.5 sm:!border-[3px]" style={{ left: "50%" }} />
          <Handle type="source" position={Position.Bottom} id="false" className="!size-3 !border-2 !border-[#11131c] !bg-rose-300 sm:!size-3.5 sm:!border-[3px]" style={{ left: "76%" }} />
        </div>
      ) : isTelegramApproval ? (
        <div className="grid grid-cols-3 border-t border-white/[0.055] px-1.5 py-1.5 text-center text-[7px] font-semibold uppercase tracking-wider sm:px-3 sm:py-2 sm:text-[8px]">
          <span className="text-emerald-200/60">Approve</span>
          <span className="text-amber-200/60">Error</span>
          <span className="text-rose-200/60">Reject</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="approved"
            className="!size-3 !border-2 !border-[#11131c] !bg-emerald-300 sm:!size-3.5 sm:!border-[3px]"
            style={{ left: "24%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="error"
            className="!size-3 !border-2 !border-[#11131c] !bg-amber-300 sm:!size-3.5 sm:!border-[3px]"
            style={{ left: "50%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="rejected"
            className="!size-3 !border-2 !border-[#11131c] !bg-rose-300 sm:!size-3.5 sm:!border-[3px]"
            style={{ left: "76%" }}
          />
        </div>
      ) : (
        <div className="flex justify-around border-t border-white/[0.055] px-2 py-1.5 text-[7px] font-semibold uppercase tracking-wider sm:px-4 sm:py-2 sm:text-[8px]">
          <span className="text-white/34">Continue</span>
          {supportsAlertOutput && (
            <span className="text-amber-200/60">Error</span>
          )}
          <Handle
            type="source"
            position={Position.Bottom}
            className="!size-3 !border-2 !border-[#11131c] sm:!size-3.5 sm:!border-[3px]"
            style={{ left: supportsAlertOutput ? "35%" : "50%", background: colors.accent,
            }}
          />
          {supportsAlertOutput && (
            <Handle type="source" position={Position.Bottom} id="error" className="!size-3 !border-2 !border-[#11131c] !bg-amber-300 sm:!size-3.5 sm:!border-[3px]" style={{ left: "65%" }} />
          )}
        </div>
      )}
    </div>
  )
}

function getActionNodeHelp(data: WorkflowNodeData): string {
  const base = data.description || getDescription(data)
  if (data.type === "action_condition") {
    return (
      data.label + ": " + base + "\nTrue/False are normal branches.\nAlert runs only if this node fails and should point to Send Email."
    )
  }
  if (data.type === "action_telegram") {
    const mode = (data.config as unknown as Record<string, unknown>)?.mode
    return mode === "approval"
      ? data.label +
          ": Pauses execution until you approve or reject in Telegram.\nExpired approvals follow Rejected."
      : data.label +
          ": Sends an internal Telegram notification.\nUse it as an Alert target or a normal workflow step."
  }
  if (data.type === "action_send_email") {
    return (
      data.label +
      ": Legacy email notification retained for existing workflows."
    )
  }
  return (
    data.label + ": " + base +
    "\nNext continues the normal path.\nAlert runs only if this node fails and should point to Telegram Notification."
  )
}

function getDescription(data: WorkflowNodeData): string {
  const config = data.config as unknown as Record<string, unknown>
  switch (data.type) {
    case "action_send_dm":
      return config.opening_message ? String(config.opening_message).substring(0, 40) + "…" : "Configure DM message"
    case "action_private_reply":
      return config.message ? String(config.message).substring(0, 40) + "…" : "Configure private reply"
    case "action_reply_comment": {
      const messages = config.messages as string[]
      return messages?.length ? messages.length + " reply message(s)" : "Configure reply"
    }
    case "action_delay":
      return (
        "Wait " + (config.duration_value || "?") + " " + (config.duration_unit || "minutes")
      )
    case "action_condition":
      if (config.condition_type === "instagram_follower_status") {
        return "Does this person follow the account?"
      }
      return (
        String(config.condition_type || "condition") + ": " + String(config.operator || "check")
      )
    case "action_http_request":
      return (
        String(config.method || "GET") + " " + (config.url ? String(config.url).substring(0, 30) : "URL not set")
      )
    case "action_ai_response":
      return String(config.provider || "AI") + " response"
    case "action_telegram":
      return config.mode === "approval"
        ? "Wait for an owner decision in Telegram"
        : "Send an encrypted-workspace Telegram update"
    default:
      return "Configure action"
  }
}

export const ActionNode = memo(ActionNodeComponent)
