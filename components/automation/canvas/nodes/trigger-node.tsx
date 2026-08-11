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
        "relative w-[152px] overflow-hidden rounded-[14px] border bg-[linear-gradient(145deg,rgba(103,232,249,.06),rgba(17,19,28,.97)_46%)] shadow-[0_12px_30px_rgba(0,0,0,.28)] backdrop-blur-xl transition duration-150 sm:w-[208px] sm:rounded-2xl sm:shadow-[0_18px_44px_rgba(0,0,0,.3)] "
        + (selected
          ? "border-cyan-300/70 ring-[3px] ring-cyan-300/10"
          : "border-cyan-300/20 hover:border-cyan-300/35")
      }
    >
      <span className="absolute inset-y-3 left-0 w-0.5 rounded-r-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,.35)]" aria-hidden="true" />
      <div className="p-2 pl-2.5 sm:p-3 sm:pl-3.5">
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-cyan-300/15 bg-cyan-300/[0.08] text-cyan-100 sm:size-9 sm:rounded-xl">
            <Icon className="size-3.5 sm:size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="hidden text-[8px] font-bold uppercase tracking-[0.18em] text-cyan-100/38 sm:block">Trigger</span>
            <p className="truncate text-[11px] font-semibold leading-4 text-white/90 sm:mt-0.5 sm:text-[13px]">{nodeData.label}</p>
          </div>
          <span
            title={getTriggerNodeHelp(nodeData)}
            className="grid size-5 shrink-0 place-items-center rounded-full border border-white/[0.07] bg-white/[0.025] text-white/28 sm:size-6"
            aria-label={nodeData.label + " help"}
          >
            <Info className="size-2.5 sm:size-3" aria-hidden="true" />
          </span>
        </div>

        <div className="mt-1.5 rounded-lg border border-cyan-200/[0.045] bg-black/10 px-2 py-1 sm:mt-2 sm:px-2.5 sm:py-1.5">
          {nodeData.type === "trigger_new_comment" && postThumbnailUrl ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="relative size-5 shrink-0 overflow-hidden rounded border border-white/10 sm:size-7 sm:rounded-lg">
                <Image src={postThumbnailUrl} alt="" fill unoptimized sizes="32px" className="object-cover" />
              </span>
              <p className="line-clamp-1 text-[9px] leading-3.5 text-white/42 sm:line-clamp-2 sm:text-[10px] sm:leading-4">{description}</p>
            </div>
          ) : (
            <p className="line-clamp-1 text-[9px] leading-3.5 text-white/42 sm:line-clamp-2 sm:text-[10px] sm:leading-4">{description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center border-t border-cyan-100/[0.055] px-2 py-1.5 text-[7px] font-semibold uppercase tracking-[0.14em] text-cyan-100/34 sm:px-3 sm:py-2 sm:text-[8px]">
        Start
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !border-2 !border-[#11131c] !bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,.65)] sm:!size-3.5 sm:!border-[3px]"
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
