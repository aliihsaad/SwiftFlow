"use client"

import { memo } from "react"
import Image from "next/image"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { AtSign, Clock, Info, Mail, MessageCircle, Reply, UserPlus } from "lucide-react"

import type { WorkflowNodeData } from "@/types/automation-graph"

const iconMap: Record<string, React.ElementType> = {
  trigger_new_comment: MessageCircle,
  trigger_new_message: Mail,
  trigger_new_follower: UserPlus,
  trigger_cron: Clock,
  trigger_story_mention: AtSign,
  trigger_story_reply: Reply,
}

function TriggerNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData
  const config = nodeData.config as unknown as Record<string, unknown>
  const postThumbnailUrl = typeof config.post_thumbnail_url === "string" ? config.post_thumbnail_url : ""
  const Icon = iconMap[nodeData.type] || MessageCircle
  const description = nodeData.description || getDescription(nodeData)

  return (
    <div
      className={
        "relative w-[184px] overflow-hidden rounded-xl border bg-[#151722]/95 shadow-[0_14px_34px_rgba(0,0,0,.26)] backdrop-blur transition duration-150 sm:w-[216px] sm:rounded-2xl sm:shadow-[0_18px_45px_rgba(0,0,0,.28)] "
        + (selected
          ? "border-cyan-300/70 ring-4 ring-cyan-300/10"
          : "border-cyan-300/20 hover:border-cyan-300/35")
      }
    >
      <div className="h-1 bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400" />
      <div className="p-2.5 sm:p-3">
        <div className="flex items-start gap-2 sm:gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-cyan-300/15 bg-cyan-300/[0.08] text-cyan-100 sm:size-9 sm:rounded-xl">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-100/40">Trigger</span>
            <p className="mt-0.5 truncate text-[13px] font-semibold text-white/90 sm:text-sm">{nodeData.label}</p>
          </div>
          <span
            title={getTriggerNodeHelp(nodeData)}
            className="grid size-6 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-white/30 sm:size-7"
            aria-label={nodeData.label + " help"}
          >
            <Info className="size-3" aria-hidden="true" />
          </span>
        </div>

        <div className="mt-2">
          {nodeData.type === "trigger_new_comment" && postThumbnailUrl ? (
            <div className="flex items-center gap-2">
              <span className="relative size-7 shrink-0 overflow-hidden rounded-md border border-white/10 sm:size-8 sm:rounded-lg">
                <Image src={postThumbnailUrl} alt="" fill unoptimized sizes="32px" className="object-cover" />
              </span>
              <p className="line-clamp-1 text-[10px] leading-4 text-white/45 sm:line-clamp-2 sm:text-[11px]">{description}</p>
            </div>
          ) : (
            <p className="line-clamp-1 text-[10px] leading-4 text-white/45 sm:line-clamp-2 sm:text-[11px]">{description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center border-t border-white/[0.06] px-3 py-2 text-[8px] font-semibold uppercase tracking-[0.16em] text-cyan-100/35 sm:text-[9px]">
        Start journey
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3.5 !border-[3px] !border-[#151722] !bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,.75)]"
      />
    </div>
  )
}

function getTriggerNodeHelp(data: WorkflowNodeData): string {
  const base = data.description || getDescription(data)
  return data.label + ": " + base + "\nThis starts the workflow.\nConnect its bottom output to the first action node."
}

function getDescription(data: WorkflowNodeData): string {
  const config = data.config as unknown as Record<string, unknown>
  switch (data.type) {
    case "trigger_new_comment": {
      const scopeLabels: Record<string, string> = {
        any_post: "posts only",
        any_reel: "Reels only",
        specific: "selected post",
      }
      const scope = scopeLabels[String(config.post_scope || (config.post_id ? "specific" : ""))]
      const suffix = scope ? " · " + scope : ""
      if (config.trigger_type === "keywords") {
        const keywords = config.keywords as string[]
        return (keywords?.length ? "Keywords: " + keywords.join(", ") : "Keywords trigger") + suffix
      }
      return "Any comment" + suffix
    }
    case "trigger_new_message":
      return config.trigger_type === "keywords" ? "Keyword messages" : "Any message"
    case "trigger_cron":
      return "Schedule: " + (config.schedule || "Not set")
    default:
      return "Trigger"
  }
}

export const TriggerNode = memo(TriggerNodeComponent)
