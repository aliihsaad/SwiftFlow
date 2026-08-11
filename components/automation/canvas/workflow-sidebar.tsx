"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AtSign,
  ChevronLeft,
  ChevronRight,
  Clock,
  GitBranch,
  Globe,
  Mail,
  MailPlus,
  MessageCircle,
  MessageSquare,
  Plus,
  Reply,
  Search,
  Send,
  Sparkles,
  Timer,
  UserPlus,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  NODE_CATALOG,
  SUPPORTED_CANVAS_TRIGGER_TYPES,
  type NodeCatalogEntry,
} from "@/types/automation-graph"

const iconComponents: Record<string, React.ElementType> = {
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
}

interface WorkflowSidebarProps {
  collapsed?: boolean
  onToggleCollapse?: () => void
  onAddNode?: (type: NodeCatalogEntry["type"], label: string) => void
}

export function WorkflowSidebar({
  collapsed = false,
  onToggleCollapse,
  onAddNode,
}: WorkflowSidebarProps) {
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [query, setQuery] = useState("")
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mediaQuery = window.matchMedia("(pointer: coarse)")
    const update = () => setIsTouchDevice(mediaQuery.matches)
    update()

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update)
      return () => mediaQuery.removeEventListener("change", update)
    }

    mediaQuery.addListener(update)
    return () => mediaQuery.removeListener(update)
  }, [])

  const supportedTriggers = useMemo(() => new Set<string>(SUPPORTED_CANVAS_TRIGGER_TYPES), [])
  const disabledActions = useMemo(() => new Set(["action_http_request"]), [])
  const normalizedQuery = query.trim().toLowerCase()
  const matchesSearch = (entry: NodeCatalogEntry) => (
    !normalizedQuery
    || entry.label.toLowerCase().includes(normalizedQuery)
    || entry.description.toLowerCase().includes(normalizedQuery)
  )

  const triggers = NODE_CATALOG.filter(
    (entry) => entry.category === "trigger"
      && supportedTriggers.has(entry.type)
      && matchesSearch(entry),
  )
  const actions = NODE_CATALOG.filter(
    (entry) => entry.category === "action"
      && !disabledActions.has(entry.type)
      && matchesSearch(entry),
  )

  const handleMobileAdd = (type: NodeCatalogEntry["type"], label: string) => {
    onAddNode?.(type, label)
    setMobileOpen(false)
  }

  return (
    <>
    <aside
      className={cn(
        "automation-sidebar-scroll hidden h-full shrink-0 flex-col overflow-y-auto border-r border-white/[0.07] bg-[#11131c]/95 transition-[width] duration-200 sm:flex",
        collapsed ? "w-14" : "w-[280px]",
      )}
      aria-label="Workflow node library"
    >
      <div className={cn("flex min-h-16 items-center border-b border-white/[0.07]", collapsed ? "justify-center" : "justify-between px-4")}>
        {!collapsed && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100/40">Node library</p>
            <p className="mt-1 text-xs text-white/45">Build your journey</p>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="grid size-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-white/40 transition hover:bg-white/[0.07] hover:text-white/75"
          aria-label={collapsed ? "Expand node library" : "Collapse node library"}
          title={collapsed ? "Expand node library" : "Collapse node library"}
        >
          {collapsed
            ? <ChevronRight className="size-4" aria-hidden="true" />
            : <ChevronLeft className="size-4" aria-hidden="true" />}
        </button>
      </div>

      {collapsed ? (
        <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto py-3">
          <span className="my-1 h-px w-7 bg-cyan-300/20" title="Triggers" />
          {NODE_CATALOG
            .filter((entry) => entry.category === "trigger" && supportedTriggers.has(entry.type))
            .map((entry) => (
              <CollapsedNode key={entry.type} entry={entry} onAddNode={onAddNode} />
            ))}
          <span className="my-1 h-px w-7 bg-violet-300/20" title="Actions" />
          {NODE_CATALOG
            .filter((entry) => entry.category === "action" && !disabledActions.has(entry.type))
            .map((entry) => (
              <CollapsedNode key={entry.type} entry={entry} onAddNode={onAddNode} />
            ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <label className="relative block">
            <span className="sr-only">Search workflow nodes</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/25" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search nodes"
              className="h-10 w-full rounded-xl border border-white/[0.07] bg-white/[0.03] pl-9 pr-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-cyan-300/20 focus:ring-2 focus:ring-cyan-300/10"
            />
          </label>

          {isTouchDevice && (
            <p className="mt-3 rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] px-3 py-2 text-[10px] leading-4 text-cyan-100/45">
              Tap a node to add it to the center of the canvas.
            </p>
          )}

          <NodeSection
            title="Start with"
            accent="cyan"
            entries={triggers}
            touchMode={isTouchDevice}
            onAddNode={onAddNode}
          />
          <NodeSection
            title="Continue with"
            accent="violet"
            entries={actions}
            touchMode={isTouchDevice}
            onAddNode={onAddNode}
          />

          {triggers.length === 0 && actions.length === 0 && (
            <div className="py-10 text-center">
              <Search className="mx-auto size-5 text-white/20" aria-hidden="true" />
              <p className="mt-3 text-xs font-medium text-white/45">No nodes found</p>
              <button type="button" onClick={() => setQuery("")} className="mt-2 text-[11px] font-semibold text-cyan-200/70">
                Clear search
              </button>
            </div>
          )}
        </div>
      )}
    </aside>

      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="absolute bottom-4 left-4 z-20 inline-flex h-11 items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300 px-4 text-xs font-bold text-[#081018] shadow-[0_14px_34px_rgba(34,211,238,.25)] transition active:scale-[0.98]"
          aria-label="Add workflow step"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add step
        </button>

        {mobileOpen && (
          <div
            className="absolute inset-0 z-40 flex items-end bg-black/55 backdrop-blur-sm"
            role="presentation"
            onClick={() => setMobileOpen(false)}
          >
            <section
              className="automation-sidebar-scroll max-h-[82vh] w-full overflow-y-auto rounded-t-[28px] border border-b-0 border-white/[0.09] bg-[#11131c]/98 px-4 pb-6 pt-3 shadow-[0_-24px_70px_rgba(0,0,0,.45)]"
              role="dialog"
              aria-modal="true"
              aria-label="Add workflow step"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100/40">Node library</p>
                  <h2 className="mt-1 text-base font-semibold text-white/90">Add the next step</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="grid size-9 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-white/45"
                  aria-label="Close node library"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>

              <label className="relative mt-4 block">
                <span className="sr-only">Search workflow nodes</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/25" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search steps"
                  className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.035] pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-cyan-300/25 focus:ring-2 focus:ring-cyan-300/10"
                  autoFocus
                />
              </label>

              <NodeSection
                title="Start with"
                accent="cyan"
                entries={triggers}
                touchMode
                onAddNode={handleMobileAdd}
              />
              <NodeSection
                title="Continue with"
                accent="violet"
                entries={actions}
                touchMode
                onAddNode={handleMobileAdd}
              />

              {triggers.length === 0 && actions.length === 0 && (
                <div className="py-10 text-center">
                  <Search className="mx-auto size-5 text-white/20" aria-hidden="true" />
                  <p className="mt-3 text-xs font-medium text-white/45">No steps found</p>
                  <button type="button" onClick={() => setQuery("")} className="mt-2 text-[11px] font-semibold text-cyan-200/70">
                    Clear search
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  )
}

function NodeSection({
  title,
  accent,
  entries,
  touchMode,
  onAddNode,
}: {
  title: string
  accent: "cyan" | "violet"
  entries: NodeCatalogEntry[]
  touchMode: boolean
  onAddNode?: (type: NodeCatalogEntry["type"], label: string) => void
}) {
  if (entries.length === 0) return null

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className={cn(
          "text-[10px] font-semibold uppercase tracking-[0.2em]",
          accent === "cyan" ? "text-cyan-100/45" : "text-violet-100/45",
        )}>
          {title}
        </h3>
        <span className="text-[10px] text-white/20">{entries.length}</span>
      </div>
      <div className="space-y-2">
        {entries.map((entry) => (
          <DraggableNode
            key={entry.type}
            entry={entry}
            onAddNode={onAddNode}
            touchMode={touchMode}
          />
        ))}
      </div>
    </section>
  )
}

function CollapsedNode({
  entry,
  onAddNode,
}: {
  entry: NodeCatalogEntry
  onAddNode?: (type: NodeCatalogEntry["type"], label: string) => void
}) {
  const Icon = iconComponents[entry.icon] || MessageCircle

  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData("application/reactflow-type", entry.type)
    event.dataTransfer.setData("application/reactflow-label", entry.label)
    event.dataTransfer.effectAllowed = "move"
  }

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={() => onAddNode?.(entry.type, entry.label)}
      title={"Add " + entry.label}
      className="grid size-9 cursor-grab place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] transition hover:scale-105 hover:border-white/[0.14] active:cursor-grabbing"
      style={{ color: entry.color }}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  )
}

function DraggableNode({
  entry,
  onAddNode,
  touchMode,
}: {
  entry: NodeCatalogEntry
  onAddNode?: (type: NodeCatalogEntry["type"], label: string) => void
  touchMode: boolean
}) {
  const Icon = iconComponents[entry.icon] || MessageCircle

  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData("application/reactflow-type", entry.type)
    event.dataTransfer.setData("application/reactflow-label", entry.label)
    event.dataTransfer.effectAllowed = "move"
  }

  const handleAdd = () => onAddNode?.(entry.type, entry.label)

  return (
    <div
      draggable={!touchMode}
      onDragStart={onDragStart}
      onClick={touchMode ? handleAdd : undefined}
      className="group flex cursor-grab items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5 transition hover:-translate-y-px hover:border-white/[0.13] hover:bg-white/[0.045] active:cursor-grabbing"
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-xl border"
        style={{
          backgroundColor: entry.color + "12",
          borderColor: entry.color + "28",
          color: entry.color,
        }}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-white/72">{entry.label}</span>
        <span className="mt-0.5 block line-clamp-1 text-[10px] leading-4 text-white/28">{entry.description}</span>
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          handleAdd()
        }}
        className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.025] text-white/30 opacity-70 transition hover:bg-white/[0.08] hover:text-white group-hover:opacity-100"
        aria-label={"Add " + entry.label}
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
