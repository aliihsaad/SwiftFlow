"use client"

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Send,
  Reply,
  MessageSquare,
  Timer,
  GitBranch,
  MailPlus,
  Globe,
  Sparkles,
} from 'lucide-react'
import type { WorkflowNodeData } from '@/types/automation-graph'

const iconMap: Record<string, React.ElementType> = {
  action_send_dm: Send,
  action_private_reply: Reply,
  action_reply_comment: MessageSquare,
  action_delay: Timer,
  action_condition: GitBranch,
  action_send_email: MailPlus,
  action_http_request: Globe,
  action_ai_response: Sparkles,
}

const colorMap: Record<string, { bg: string; border: string; borderSelected: string }> = {
  action_send_dm: { bg: 'bg-purple-500', border: 'border-purple-400/50', borderSelected: 'border-purple-500' },
  action_private_reply: { bg: 'bg-purple-500', border: 'border-purple-400/50', borderSelected: 'border-purple-500' },
  action_reply_comment: { bg: 'bg-purple-500', border: 'border-purple-400/50', borderSelected: 'border-purple-500' },
  action_delay: { bg: 'bg-amber-500', border: 'border-amber-400/50', borderSelected: 'border-amber-500' },
  action_condition: { bg: 'bg-emerald-500', border: 'border-emerald-400/50', borderSelected: 'border-emerald-500' },
  action_send_email: { bg: 'bg-purple-500', border: 'border-purple-400/50', borderSelected: 'border-purple-500' },
  action_http_request: { bg: 'bg-purple-500', border: 'border-purple-400/50', borderSelected: 'border-purple-500' },
  action_ai_response: { bg: 'bg-pink-500', border: 'border-pink-400/50', borderSelected: 'border-pink-500' },
}

function ActionNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData
  const Icon = iconMap[nodeData.type] || Send
  const colors = colorMap[nodeData.type] || colorMap.action_send_dm
  const isCondition = nodeData.type === 'action_condition'

  return (
    <div
      className={`
        relative rounded-xl border-2 bg-background shadow-md min-w-[180px] max-w-[220px]
        transition-all duration-150
        ${selected ? `${colors.borderSelected} shadow-lg` : colors.border}
      `}
    >
      {/* Input Handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className={`!w-3 !h-3 !border-2 !border-background ${isCondition ? '!bg-emerald-500' : '!bg-purple-500'}`}
      />

      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2 ${colors.bg} rounded-t-[10px]`}>
        <Icon className="h-4 w-4 text-white shrink-0" />
        <span className="text-sm font-medium text-white truncate">
          {nodeData.label}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground truncate">
          {nodeData.description || getDescription(nodeData)}
        </p>
      </div>

      {/* Output Handles */}
      {isCondition ? (
        <>
          {/* True output (left-bottom) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-background"
            style={{ left: '30%' }}
          />
          {/* False output (right-bottom) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!w-3 !h-3 !bg-red-500 !border-2 !border-background"
            style={{ left: '70%' }}
          />
          <div className="flex justify-between px-4 pb-1">
            <span className="text-[10px] text-emerald-600">True</span>
            <span className="text-[10px] text-red-500">False</span>
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className={`!w-3 !h-3 !border-2 !border-background ${
            nodeData.type === 'action_delay' ? '!bg-amber-500' : '!bg-purple-500'
          }`}
        />
      )}
    </div>
  )
}

function getDescription(data: WorkflowNodeData): string {
  const config = data.config as unknown as Record<string, unknown>
  switch (data.type) {
    case 'action_send_dm':
      return config.opening_message
        ? (config.opening_message as string).substring(0, 40) + '...'
        : 'Configure DM message'
    case 'action_private_reply':
      return config.message
        ? (config.message as string).substring(0, 40) + '...'
        : 'Configure private reply'
    case 'action_reply_comment': {
      const msgs = config.messages as string[]
      return msgs?.length ? `${msgs.length} reply message(s)` : 'Configure reply'
    }
    case 'action_delay':
      return `Wait ${config.duration_value || '?'} ${config.duration_unit || 'minutes'}`
    case 'action_condition':
      return `${config.condition_type || 'condition'}: ${config.operator || 'check'}`
    case 'action_http_request':
      return `${config.method || 'GET'} ${config.url ? (config.url as string).substring(0, 30) : 'URL not set'}`
    case 'action_ai_response':
      return `${config.provider || 'AI'} response`
    default:
      return 'Configure action'
  }
}

export const ActionNode = memo(ActionNodeComponent)
