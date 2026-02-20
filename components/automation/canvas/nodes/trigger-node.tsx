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
  const Icon = iconMap[nodeData.type] || MessageCircle

  return (
    <div
      className={`
        relative rounded-xl border-2 bg-background shadow-md min-w-[180px] max-w-[220px]
        transition-all duration-150
        ${selected ? 'border-blue-500 shadow-blue-500/25 shadow-lg' : 'border-blue-400/50'}
      `}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-t-[10px]">
        <Icon className="h-4 w-4 text-white shrink-0" />
        <span className="text-sm font-medium text-white truncate">
          {nodeData.label}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {nodeData.type === 'trigger_new_comment' && (nodeData.config as any)?.post_thumbnail_url ? (
          <div className="flex items-center gap-2">
            <img
              src={(nodeData.config as any).post_thumbnail_url}
              alt="Post"
              className="w-8 h-8 rounded object-cover shrink-0"
            />
            <p className="text-xs text-muted-foreground truncate flex-1">
              {getDescription(nodeData)}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground truncate">
            {nodeData.description || getDescription(nodeData)}
          </p>
        )}
      </div>

      {/* Output Handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-background"
      />
    </div>
  )
}

function getDescription(data: WorkflowNodeData): string {
  const config = data.config as unknown as Record<string, unknown>
  switch (data.type) {
    case 'trigger_new_comment': {
      const tt = config.trigger_type as string
      if (tt === 'keywords') {
        const kw = config.keywords as string[]
        return kw?.length ? `Keywords: ${kw.join(', ')}` : 'Keywords trigger'
      }
      return 'Any comment'
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
