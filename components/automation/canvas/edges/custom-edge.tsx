"use client"

import { createContext, useContext, type ReactNode } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { Trash2 } from 'lucide-react'

type EdgeActions = {
  onDeleteEdge: (edgeId: string) => void
  onSelectEdge: (edgeId: string) => void
}

const EdgeActionsContext = createContext<EdgeActions | null>(null)

export function EdgeActionsProvider({
  children,
  onDeleteEdge,
  onSelectEdge,
}: EdgeActions & { children: ReactNode }) {
  return (
    <EdgeActionsContext.Provider value={{ onDeleteEdge, onSelectEdge }}>
      {children}
    </EdgeActionsContext.Provider>
  )
}

export function CustomEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    style = {},
    markerEnd,
    selected,
  } = props
  const edgeActions = useContext(EdgeActionsContext)
  const sourceHandle = (props as EdgeProps & { sourceHandle?: string | null }).sourceHandle
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const label = (data?.label as string | undefined) || getEdgeLabelFromHandle(sourceHandle)
  const stroke = getEdgeStrokeFromHandle(sourceHandle)

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          strokeWidth: 2,
          stroke,
          ...style,
        }}
      />
      {/* Animated flow dot */}
      <circle r="3" fill="#38BDF8">
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
      </circle>
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={
              'group nodrag nopan inline-flex min-h-8 items-center gap-1 rounded-full border bg-[#151620]/95 py-1 pl-2.5 pr-1 text-[10px] font-semibold shadow-[0_10px_28px_rgba(0,0,0,.32)] backdrop-blur-xl transition ' +
              (selected
                ? 'border-cyan-300/45 text-white/85 ring-4 ring-cyan-300/10'
                : 'border-white/[0.09] text-white/55 hover:border-white/20 hover:text-white/75')
            }
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              edgeActions?.onSelectEdge(id)
            }}
            role="button"
            tabIndex={0}
            aria-label={`${label} connection. Select to show actions.`}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                edgeActions?.onSelectEdge(id)
              }
            }}
          >
            <span className="px-0.5 uppercase tracking-[0.12em]">{label}</span>
            <button
              type="button"
              className={
                'grid size-7 place-items-center rounded-full text-rose-200 transition hover:bg-rose-400/15 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 ' +
                (selected
                  ? 'pointer-events-auto opacity-100'
                  : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100')
              }
              aria-label={`Delete ${label} connection`}
              title="Delete connection"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                edgeActions?.onDeleteEdge(id)
              }}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

function getEdgeLabelFromHandle(handle: string | null | undefined): string | undefined {
  if (handle === 'true') return 'True'
  if (handle === 'false') return 'False'
  if (handle === 'error') return 'Alert'
  return 'Next'
}

function getEdgeStrokeFromHandle(handle: string | null | undefined): string {
  if (handle === 'true') return '#34d399'
  if (handle === 'false') return '#f87171'
  if (handle === 'error') return '#fbbf24'
  return '#64748B'
}
