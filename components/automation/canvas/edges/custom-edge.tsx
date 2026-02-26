"use client"

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'

export function CustomEdge(props: EdgeProps) {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    style = {},
    markerEnd,
  } = props
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
              background: '#151620',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.55)',
            }}
            className="rounded px-2 py-0.5 text-xs"
          >
            {label}
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
