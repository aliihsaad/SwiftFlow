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
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="cursor-pointer"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          edgeActions?.onSelectEdge(id)
        }}
        role="button"
        tabIndex={0}
        aria-label="Select connection"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            edgeActions?.onSelectEdge(id)
          }
        }}
      />
      <circle r="2.5" fill={stroke} opacity="0.8">
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
      </circle>
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan nowheel grid size-10 place-items-center"
        >
          <button
            type="button"
            className={
              'grid size-7 shrink-0 place-items-center rounded-full border bg-[#171923]/95 text-rose-200 shadow-[0_8px_22px_rgba(0,0,0,.34)] backdrop-blur-xl transition-[color,background-color,border-color,box-shadow,opacity] duration-150 hover:border-rose-300/50 hover:bg-rose-400/15 hover:text-rose-100 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 ' +
              (selected
                ? 'border-rose-300/45 opacity-100 ring-4 ring-rose-300/10'
                : 'border-white/10 opacity-60')
            }
            aria-label="Delete connection"
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
    </>
  )
}

function getEdgeStrokeFromHandle(handle: string | null | undefined): string {
  if (handle === 'true') return '#34d399'
  if (handle === 'false') return '#f87171'
  if (handle === 'error') return '#fbbf24'
  return '#64748B'
}
