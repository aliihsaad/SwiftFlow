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
  Info,
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

const colorMap: Record<string, { bg: string; border: string; borderSelected: string; handle: string; trueLabel?: string }> = {
  action_send_dm: { bg: 'linear-gradient(135deg, #fb7185, #f59e0b)', border: 'rgba(251,113,133,0.35)', borderSelected: 'rgba(251,113,133,0.85)', handle: '#fb7185' },
  action_private_reply: { bg: 'linear-gradient(135deg, #fb7185, #f59e0b)', border: 'rgba(251,113,133,0.35)', borderSelected: 'rgba(251,113,133,0.85)', handle: '#fb7185' },
  action_reply_comment: { bg: 'linear-gradient(135deg, #fb7185, #f59e0b)', border: 'rgba(251,113,133,0.35)', borderSelected: 'rgba(251,113,133,0.85)', handle: '#fb7185' },
  action_delay: { bg: 'linear-gradient(135deg, #f59e0b, #fbbf24)', border: 'rgba(245,158,11,0.35)', borderSelected: 'rgba(245,158,11,0.85)', handle: '#f59e0b' },
  action_condition: { bg: 'linear-gradient(135deg, #34d399, #10b981)', border: 'rgba(16,185,129,0.35)', borderSelected: 'rgba(16,185,129,0.85)', handle: '#10b981' },
  action_send_email: { bg: 'linear-gradient(135deg, #38bdf8, #0ea5e9)', border: 'rgba(56,189,248,0.35)', borderSelected: 'rgba(56,189,248,0.85)', handle: '#38bdf8' },
  action_http_request: { bg: 'linear-gradient(135deg, #38bdf8, #0ea5e9)', border: 'rgba(56,189,248,0.35)', borderSelected: 'rgba(56,189,248,0.85)', handle: '#38bdf8' },
  action_ai_response: { bg: 'linear-gradient(135deg, #f43f5e, #fb7185)', border: 'rgba(251,113,133,0.35)', borderSelected: 'rgba(251,113,133,0.85)', handle: '#fb7185' },
}

function ActionNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData
  const Icon = iconMap[nodeData.type] || Send
  const colors = colorMap[nodeData.type] || colorMap.action_send_dm
  const isCondition = nodeData.type === 'action_condition'
  const supportsAlertOutput = !isCondition && nodeData.type !== 'action_send_email'
  const nodeHelp = getActionNodeHelp(nodeData)

  return (
    <div
      className={`
        relative rounded-xl border-2 shadow-md min-w-[180px] max-w-[220px]
        transition-all duration-150
        ${selected ? 'shadow-lg' : ''}
      `}
      style={{
        background: '#151620',
        borderColor: selected ? colors.borderSelected : colors.border,
        boxShadow: selected ? `0 10px 26px ${colors.border.replace('0.35', '0.16')}` : undefined,
      }}
    >
      {/* Input Handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !border-2"
        style={{ background: isCondition ? '#10b981' : colors.handle, borderColor: '#151620' }}
      />

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-[10px]"
        style={{ background: colors.bg }}
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
        <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.55)' }}>
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
            className="!w-3 !h-3 !border-2"
            style={{ left: '24%', background: '#10b981', borderColor: '#151620' }}
          />
          {/* Alert output (center-bottom) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="error"
            className="!w-3 !h-3 !border-2"
            style={{ left: '50%', background: '#f59e0b', borderColor: '#151620' }}
          />
          {/* False output (right-bottom) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!w-3 !h-3 !border-2"
            style={{ left: '76%', background: '#f87171', borderColor: '#151620' }}
          />
          <div className="grid grid-cols-3 items-center px-3 pb-1 text-center">
            <span className="text-[10px]" style={{ color: '#34d399' }}>True</span>
            <span className="text-[10px]" style={{ color: '#fbbf24' }}>Alert</span>
            <span className="text-[10px]" style={{ color: '#f87171' }}>False</span>
          </div>
        </>
      ) : (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            className="!w-3 !h-3 !border-2"
            style={{ left: supportsAlertOutput ? '35%' : '50%', background: colors.handle, borderColor: '#151620' }}
          />
          {supportsAlertOutput && (
            <Handle
              type="source"
              position={Position.Bottom}
              id="error"
              className="!w-3 !h-3 !border-2"
              style={{ left: '65%', background: '#f59e0b', borderColor: '#151620' }}
            />
          )}
          {supportsAlertOutput ? (
            <div className="flex justify-between px-4 pb-1">
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.6)' }}>Next</span>
              <span className="text-[10px]" style={{ color: '#fbbf24' }}>Alert</span>
            </div>
          ) : (
            <div className="flex justify-center px-4 pb-1">
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.6)' }}>Next</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function getActionNodeHelp(data: WorkflowNodeData): string {
  const base = data.description || getDescription(data)

  if (data.type === 'action_condition') {
    return `${data.label}: ${base}\nTrue/False are normal branches.\nAlert runs only if this node fails and should point to Send Email.`
  }

  if (data.type === 'action_send_email') {
    return `${data.label}: Sends an email to a custom address.\nUse this as the target of an Alert path for failure notifications.`
  }

  return `${data.label}: ${base}\nNext continues the normal path.\nAlert runs only if this node fails and should point to Send Email.`
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
