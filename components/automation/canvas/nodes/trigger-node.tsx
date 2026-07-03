"use client"

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  MessageCircle,
  Mail,
  UserPlus,
  Clock,
  AtSign,
  Reply,
  Info,
} from 'lucide-react'
import type { WorkflowNodeData } from '@/types/automation-graph'

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
  const postThumbnailUrl = typeof config.post_thumbnail_url === 'string' ? config.post_thumbnail_url : ''
  const Icon = iconMap[nodeData.type] || MessageCircle
  const nodeHelp = getTriggerNodeHelp(nodeData)

  return (
    <div
      className={`
        relative rounded-xl border-2 shadow-md min-w-[180px] max-w-[220px]
        transition-all duration-150
        ${selected ? 'shadow-lg' : ''}
      `}
      style={{
        background: '#151620',
        borderColor: selected ? 'rgba(56,189,248,0.85)' : 'rgba(56,189,248,0.35)',
        boxShadow: selected ? '0 10px 26px rgba(56,189,248,0.16)' : undefined,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-[10px]"
        style={{ background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)' }}
      >
        <Icon className="h-4 w-4 text-white shrink-0" />
        <span className="text-sm font-medium text-white truncate flex-1">
          {nodeData.label}
        </span>
        <span
          title={nodeHelp}
          className="inline-flex items-center justify-center rounded-full bg-black/20 p-1 text-white/80 shrink-0"
          aria-label={`${nodeData.label} help`}
        >
          <Info className="h-3.5 w-3.5" />
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {nodeData.type === 'trigger_new_comment' && postThumbnailUrl ? (
          <div className="flex items-center gap-2">
            <img
              src={postThumbnailUrl}
              alt="Post"
              className="w-8 h-8 rounded object-cover shrink-0"
            />
            <p className="text-xs truncate flex-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {getDescription(nodeData)}
            </p>
          </div>
        ) : (
          <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {nodeData.description || getDescription(nodeData)}
          </p>
        )}
      </div>

      {/* Output Handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !border-2"
        style={{ background: '#38bdf8', borderColor: '#151620' }}
      />
    </div>
  )
}

function getTriggerNodeHelp(data: WorkflowNodeData): string {
  const base = data.description || getDescription(data)
  return `${data.label}: ${base}\nThis starts the workflow.\nConnect its bottom output to the first action node.`
}

function getDescription(data: WorkflowNodeData): string {
  const config = data.config as unknown as Record<string, unknown>
  switch (data.type) {
    case 'trigger_new_comment': {
      const scopeLabels: Record<string, string> = {
        any_post: 'posts only',
        any_reel: 'Reels only',
        specific: 'selected post',
      }
      const scope = scopeLabels[String(config.post_scope || (config.post_id ? 'specific' : ''))]
      const suffix = scope ? ` · ${scope}` : ''

      const tt = config.trigger_type as string
      if (tt === 'keywords') {
        const kw = config.keywords as string[]
        return (kw?.length ? `Keywords: ${kw.join(', ')}` : 'Keywords trigger') + suffix
      }
      return `Any comment${suffix}`
    }
    case 'trigger_new_message':
      return config.trigger_type === 'keywords' ? 'Keyword messages' : 'Any message'
    case 'trigger_cron':
      return `Schedule: ${config.schedule || 'Not set'}`
    default:
      return 'Trigger'
  }
}

export const TriggerNode = memo(TriggerNodeComponent)
