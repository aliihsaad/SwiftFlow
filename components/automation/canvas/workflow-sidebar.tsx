"use client"

import { NODE_CATALOG, type NodeCatalogEntry } from '@/types/automation-graph'
import {
  MessageCircle,
  Mail,
  UserPlus,
  Clock,
  AtSign,
  Reply,
  Send,
  MessageSquare,
  Timer,
  GitBranch,
  MailPlus,
  Globe,
  Sparkles,
} from 'lucide-react'

const iconComponents: Record<string, React.ElementType> = {
  MessageCircle, Mail, UserPlus, Clock, AtSign, Reply,
  Send, MessageSquare, Timer, GitBranch, MailPlus, Globe, Sparkles,
}

interface WorkflowSidebarProps {
  collapsed?: boolean
}

export function WorkflowSidebar({ collapsed }: WorkflowSidebarProps) {
  const supportedTriggers = new Set([
    'trigger_new_comment',
    'trigger_new_message',
    'trigger_story_mention',
  ])
  const triggers = NODE_CATALOG.filter(
    n => n.category === 'trigger' && supportedTriggers.has(n.type),
  )
  const actions = NODE_CATALOG.filter(n => n.category === 'action')

  if (collapsed) return null

  return (
    <div className="w-56 border-r border-border bg-muted/30 h-full overflow-y-auto shrink-0">
      <div className="p-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Triggers
        </h3>
        <div className="space-y-1">
          {triggers.map(entry => (
            <DraggableNode key={entry.type} entry={entry} />
          ))}
        </div>

        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-5 mb-3">
          Actions
        </h3>
        <div className="space-y-1">
          {actions.map(entry => (
            <DraggableNode key={entry.type} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  )
}

function DraggableNode({ entry }: { entry: NodeCatalogEntry }) {
  const Icon = iconComponents[entry.icon] || MessageCircle

  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow-type', entry.type)
    event.dataTransfer.setData('application/reactflow-label', entry.label)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-background cursor-grab
                 hover:border-border hover:shadow-sm active:cursor-grabbing transition-all text-sm"
    >
      <div
        className="flex items-center justify-center w-7 h-7 rounded-md shrink-0"
        style={{ backgroundColor: entry.color + '20', color: entry.color }}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{entry.label}</p>
      </div>
    </div>
  )
}
