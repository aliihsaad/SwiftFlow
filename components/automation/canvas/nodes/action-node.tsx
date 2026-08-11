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
      className="relative w-[184px] overflow-hidden rounded-xl border bg-[#151722]/95 shadow-[0_14px_34px_rgba(0,0,0,.26)] backdrop-blur transition duration-150 sm:w-[216px] sm:rounded-2xl sm:shadow-[0_18px_45px_rgba(0,0,0,.28)]"
      style={{
        borderColor: selected ? colors.selected : colors.border,
        boxShadow: selected ? "0 18px 48px " + colors.glow : undefined,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3.5 !border-[3px] !border-[#151722]"
        style={{ background: colors.accent }}
      />

      <div className="h-1" style={{ background: "linear-gradient(90deg, transparent, " + colors.accent + ", transparent)",
        }} />
      <div className="p-2.5 sm:p-3">
        <div className="flex items-start gap-2 sm:gap-2.5">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-lg border sm:size-9 sm:rounded-xl"
            style={{ color: colors.accent, borderColor: colors.border, backgroundColor: colors.glow,
            }}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/28">
              {isCondition ? "Decision" : nodeData.type === "action_ai_response" ? "Intelligence" : "Action"}
            </span>
            <p className="mt-0.5 truncate text-[13px] font-semibold text-white/90 sm:text-sm">{nodeData.label}</p>
          </div>
          <span
            title={getActionNodeHelp(nodeData)}
            className="grid size-6 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-white/30 sm:size-7"
            aria-label={nodeData.label + " help"}
          >
            <Info className="size-3" aria-hidden="true" />
          </span>
        </div>
        <p className="mt-2 line-clamp-1 text-[10px] leading-4 text-white/45 sm:line-clamp-2 sm:text-[11px]">
          {description}
        </p>
      </div>

      {isCondition ? (
        <div className="grid grid-cols-3 border-t border-white/[0.06] px-2 py-2 text-center text-[8px] font-semibold uppercase tracking-wider sm:px-3 sm:text-[9px]">
          <span className="text-emerald-200/60">True</span>
          <span className="text-amber-200/60">Alert</span>
          <span className="text-rose-200/60">False</span>
          <Handle type="source" position={Position.Bottom} id="true" className="!size-3.5 !border-[3px] !border-[#151722] !bg-emerald-300" style={{ left: "24%" }} />
          <Handle type="source" position={Position.Bottom} id="error" className="!size-3.5 !border-[3px] !border-[#151722] !bg-amber-300" style={{ left: "50%" }} />
          <Handle type="source" position={Position.Bottom} id="false" className="!size-3.5 !border-[3px] !border-[#151722] !bg-rose-300" style={{ left: "76%" }} />
        </div>
      ) : isTelegramApproval ? (
        <div className="grid grid-cols-3 border-t border-white/[0.06] px-2 py-2 text-center text-[8px] font-semibold uppercase tracking-wider sm:px-3 sm:text-[9px]">
          <span className="text-emerald-200/60">Approved</span>
          <span className="text-amber-200/60">Alert</span>
          <span className="text-rose-200/60">Rejected</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="approved"
            className="!size-3.5 !border-[3px] !border-[#151722] !bg-emerald-300"
            style={{ left: "24%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="error"
            className="!size-3.5 !border-[3px] !border-[#151722] !bg-amber-300"
            style={{ left: "50%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="rejected"
            className="!size-3.5 !border-[3px] !border-[#151722] !bg-rose-300"
            style={{ left: "76%" }}
          />
        </div>
      ) : (
        <div className="flex justify-around border-t border-white/[0.06] px-3 py-2 text-[8px] font-semibold uppercase tracking-wider sm:px-4 sm:text-[9px]">
          <span className="text-white/38">Next</span>
          {supportsAlertOutput && (
            <span className="text-amber-200/60">Alert</span>
          )}
          <Handle
            type="source"
            position={Position.Bottom}
            className="!size-3.5 !border-[3px] !border-[#151722]"
            style={{ left: supportsAlertOutput ? "35%" : "50%", background: colors.accent,
            }}
          />
          {supportsAlertOutput && (
            <Handle type="source" position={Position.Bottom} id="error" className="!size-3.5 !border-[3px] !border-[#151722] !bg-amber-300" style={{ left: "65%" }} />
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
