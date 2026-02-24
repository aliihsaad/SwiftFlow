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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const iconComponents: Record<string, React.ElementType> = {
  MessageCircle, Mail, UserPlus, Clock, AtSign, Reply,
  Send, MessageSquare, Timer, GitBranch, MailPlus, Globe, Sparkles,
}

interface WorkflowSidebarProps {
  collapsed?: boolean
  onToggleCollapse?: () => void
  onAddNode?: (type: NodeCatalogEntry['type'], label: string) => void
}

export function WorkflowSidebar({ collapsed = false, onToggleCollapse, onAddNode }: WorkflowSidebarProps) {
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
  ])
  const triggers = NODE_CATALOG.filter(
    n => n.category === 'trigger' && supportedTriggers.has(n.type),
  )
  const disabledActions = new Set(['action_http_request'])
  const actions = NODE_CATALOG.filter(
    n => n.category === 'action' && !disabledActions.has(n.type),
  )

  return (
    <div
      className={cn(
        'h-full overflow-y-auto shrink-0 flex flex-col transition-all duration-200 automation-sidebar-scroll',
        collapsed ? 'w-12' : 'w-56',
      )}
      style={{ borderRight: '1px solid rgba(255,255,255,0.08)', background: '#151620' }}
    >
      {/* Toggle button */}
      <button
        onClick={onToggleCollapse}
        className="flex items-center justify-center h-9 w-full shrink-0 transition-colors hover:bg-white/5"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.4)',
        }}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed
          ? <ChevronRight className="h-4 w-4" />
          : <ChevronLeft className="h-4 w-4" />
        }
      </button>

      {collapsed ? (
        /* Icon-only strip */
        <div className="flex flex-col items-center py-2 gap-1 overflow-y-auto">
          {/* Triggers section dot */}
          <div
            className="w-6 h-px my-1"
            style={{ background: 'rgba(255,255,255,0.08)' }}
            title="Triggers"
          />
          {triggers.map(entry => (
            <CollapsedNode key={entry.type} entry={entry} onAddNode={onAddNode} />
          ))}
          <div
            className="w-6 h-px my-1"
            style={{ background: 'rgba(255,255,255,0.08)' }}
            title="Actions"
          />
          {actions.map(entry => (
            <CollapsedNode key={entry.type} entry={entry} onAddNode={onAddNode} />
          ))}
        </div>
      ) : (
        /* Full expanded view */
        <div className="p-3 flex-1 overflow-y-auto">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Triggers
          </h3>
          {isTouchDevice && (
            <p className="text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.32)' }}>
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

          <h3 className="text-xs font-semibold uppercase tracking-wider mt-5 mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
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
      )}
    </div>
  )
}


/* ── Collapsed icon button ── */
function CollapsedNode({
  entry,
  onAddNode,
}: {
  entry: NodeCatalogEntry
  onAddNode?: (type: NodeCatalogEntry['type'], label: string) => void
}) {
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
      onClick={() => onAddNode?.(entry.type, entry.label)}
      title={entry.label}
      className="flex items-center justify-center w-8 h-8 rounded-lg cursor-grab active:cursor-grabbing transition-all hover:scale-110"
      style={{
        backgroundColor: entry.color + '20',
        border: '1px solid ' + entry.color + '40',
        color: entry.color,
      }}
    >
      <Icon className="h-3.5 w-3.5" />
    </div>
  )
}

/* ── Full draggable node row ── */
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
      className="flex items-center gap-2 p-2 rounded-lg cursor-grab
                 active:cursor-grabbing transition-all text-sm"
      style={{
        background: '#1b1d28',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
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
          className="ml-auto h-6 w-6 shrink-0 rounded flex items-center justify-center"
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.02)',
            color: 'rgba(255,255,255,0.55)',
          }}
          aria-label={`Add ${entry.label}`}
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
