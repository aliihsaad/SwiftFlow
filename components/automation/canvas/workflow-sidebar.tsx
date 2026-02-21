"use client"

import { useEffect, useState } from 'react'
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
  Plus,
} from 'lucide-react'

const iconComponents: Record<string, React.ElementType> = {
  MessageCircle, Mail, UserPlus, Clock, AtSign, Reply,
  Send, MessageSquare, Timer, GitBranch, MailPlus, Globe, Sparkles,
}

interface WorkflowSidebarProps {
  collapsed?: boolean
  onAddNode?: (type: NodeCatalogEntry['type'], label: string) => void
}

export function WorkflowSidebar({ collapsed, onAddNode }: WorkflowSidebarProps) {
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(pointer: coarse)')
    const update = () => setIsTouchDevice(mq.matches)
    update()

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    }

    mq.addListener(update)
    return () => mq.removeListener(update)
  }, [])

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
        {isTouchDevice && (
          <p className="text-[10px] text-muted-foreground mb-2">
            Tap a node to add it to canvas center.
          </p>
        )}
        <div className="space-y-1">
          {triggers.map(entry => (
            <DraggableNode
              key={entry.type}
              entry={entry}
              onAddNode={onAddNode}
              touchMode={isTouchDevice}
            />
          ))}
        </div>

        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-5 mb-3">
          Actions
        </h3>
        <div className="space-y-1">
          {actions.map(entry => (
            <DraggableNode
              key={entry.type}
              entry={entry}
              onAddNode={onAddNode}
              touchMode={isTouchDevice}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DraggableNode({
  entry,
  onAddNode,
  touchMode,
}: {
  entry: NodeCatalogEntry
  onAddNode?: (type: NodeCatalogEntry['type'], label: string) => void
  touchMode: boolean
}) {
  const Icon = iconComponents[entry.icon] || MessageCircle

  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow-type', entry.type)
    event.dataTransfer.setData('application/reactflow-label', entry.label)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleTapAdd = () => {
    onAddNode?.(entry.type, entry.label)
  }

  return (
    <div
      draggable={!touchMode}
      onDragStart={onDragStart}
      onClick={touchMode ? handleTapAdd : undefined}
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
      {touchMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleTapAdd()
          }}
          className="ml-auto h-6 w-6 shrink-0 rounded border border-border/60 bg-background text-muted-foreground hover:text-foreground flex items-center justify-center"
          aria-label={`Add ${entry.label}`}
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
