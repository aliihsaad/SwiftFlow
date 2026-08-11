"use client"

import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  ConnectionMode,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type ReactFlowInstance,
  type Node,
  type NodeChange,
  type IsValidConnection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { TriggerNode } from './nodes/trigger-node'
import { ActionNode } from './nodes/action-node'
import { CustomEdge, EdgeActionsProvider } from './edges/custom-edge'
import { WorkflowSidebar } from './workflow-sidebar'
import { WorkflowToolbar } from './workflow-toolbar'
import { NodeConfigPanel } from './nodes/node-config-panel'
import {
  isTriggerNode,
  getDefaultConfig,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNodeData,
  type WorkflowNodeType,
} from '@/types/automation-graph'
import { useToast } from '@/components/ui/use-toast'

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
}

const edgeTypes = {
  custom: CustomEdge,
}

interface WorkflowCanvasProps {
  automationId?: string
  automationName: string
  isActive: boolean
  initialGraph?: WorkflowGraph
  onSave: (graph: WorkflowGraph, name: string, isActive: boolean,
  ) => Promise<void>
  onBack: () => void
}

let nodeIdCounter = 0
function getNextNodeId() {
  return `node-${Date.now()}-${++nodeIdCounter}`
}

type ConnectionCheckResult = { ok: true } | { ok: false; reason: string }
type ConnectionLike = {
  source?: string | null
  target?: string | null
  sourceHandle?: string | null | undefined
  targetHandle?: string | null | undefined
}

function normalizeHandleKey(handle: string | null | undefined): string {
  return handle || '__default__'
}

function isTelegramApprovalData(data: WorkflowNodeData): boolean {
  return (
    data.type === 'action_telegram' &&
    (data.config as unknown as Record<string, unknown> | undefined)?.mode ===
      'approval'
  )
}

function isAlertTargetData(data: WorkflowNodeData): boolean {
  return (
    data.type === 'action_send_email' ||
    (data.type === 'action_telegram' && !isTelegramApprovalData(data))
  )
}

function getEdgeLabelFromSourceHandle(handle: string | null | undefined,
): string {
  if (handle === 'true') return 'True'
  if (handle === 'false') return 'False'
  if (handle === 'approved') return 'Approved'
  if (handle === 'rejected') return 'Rejected'
  if (handle === 'error') return 'Alert'
  return 'Next'
}

function getEdgeStyleFromSourceHandle(handle: string | null | undefined): { stroke?: string } {
  if (handle === 'true' || handle === 'approved') return { stroke: '#34d399' }
  if (handle === 'false' || handle === 'rejected') return { stroke: '#f87171' }
  if (handle === 'error') return { stroke: '#fbbf24' }
  return { stroke: '#64748B' }
}

export function WorkflowCanvas({
  automationName: initialName,
  isActive: initialActive,
  initialGraph,
  onSave,
  onBack,
}: WorkflowCanvasProps) {
  const { toast } = useToast()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph?.nodes || [],
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph?.edges || [],
  )

  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
  const [automationName, setAutomationName] = useState(initialName)
  const [isActive, setIsActive] = useState(initialActive)
  const [isSaving, setIsSaving] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 768
  })


  // Track undo/redo history
  const [history, setHistory] = useState<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const pushHistory = useCallback(() => {
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      })
      return newHistory.slice(-50) // keep last 50
    })
    setHistoryIndex((prev) => Math.min(prev + 1, 49))
  }, [nodes, edges, historyIndex])

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return
    const prev = history[historyIndex - 1]
    if (prev) {
      setNodes(prev.nodes)
      setEdges(prev.edges)
      setHistoryIndex((i) => i - 1)
    }
  }, [history, historyIndex, setNodes, setEdges])

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return
    const next = history[historyIndex + 1]
    if (next) {
      setNodes(next.nodes)
      setEdges(next.edges)
      setHistoryIndex((i) => i + 1)
    }
  }, [history, historyIndex, setNodes, setEdges])

  const getNodeById = useCallback((nodeId: string | null | undefined) => {
    if (!nodeId) return null
    return nodes.find((node) => node.id === nodeId) || null
  }, [nodes],
  )

  const checkConnection = useCallback((
    params: ConnectionLike,
    currentEdges: WorkflowEdge[],
  ): ConnectionCheckResult => {
    const sourceId = params.source || null
    const targetId = params.target || null

    if (!sourceId || !targetId) {
      return { ok: false, reason: 'Connect a source node to a target node handle.',
        }
    }

    if (sourceId === targetId) {
      return { ok: false, reason: 'A node cannot connect to itself.' }
    }

    const sourceNode = getNodeById(sourceId)
    const targetNode = getNodeById(targetId)

    if (!sourceNode || !targetNode) {
      return { ok: false, reason: 'Connection references a missing node.' }
    }

    const sourceData = sourceNode.data as unknown as WorkflowNodeData
    const targetData = targetNode.data as unknown as WorkflowNodeData
    const sourceType = sourceData.type
    const targetType = targetData.type
    const sourceHandle = params.sourceHandle ?? null
    const sourceHandleKey = normalizeHandleKey(sourceHandle)

    if (isTriggerNode(targetType)) {
      return { ok: false, reason: 'Trigger nodes cannot have incoming connections.',
        }
    }

    const exactDuplicate = currentEdges.some((edge) =>
      edge.source === sourceId &&
      edge.target === targetId &&
      normalizeHandleKey(edge.sourceHandle) === sourceHandleKey &&
      normalizeHandleKey(edge.targetHandle) === normalizeHandleKey(params.targetHandle),
    )
    if (exactDuplicate) {
      return { ok: false, reason: 'That connection already exists.' }
    }

    const incomingToTarget = currentEdges.filter((edge) => edge.target === targetId,
      )
    if (incomingToTarget.length >= 1) {
      return { ok: false, reason: 'Each action node can only have one incoming connection.',
        }
    }

    const outgoingFromSameHandle = currentEdges.filter((edge) =>
      edge.source === sourceId && normalizeHandleKey(edge.sourceHandle) === sourceHandleKey,
    )

    if (sourceHandle === 'error' && !isAlertTargetData(targetData)) {
      return { ok: false, reason:
            'Alert paths can only connect to a Telegram Notification node.',
        }
    }

    const isConditionSource = sourceType === 'action_condition'
      const isTelegramApprovalSource = isTelegramApprovalData(sourceData)
      if (isConditionSource) {
      if (!['true', 'false', 'error'].includes(sourceHandle || '')) {
        return { ok: false, reason:
              'Condition nodes must connect from True, False, or Alert outputs.',
          }
      }
      if (outgoingFromSameHandle.length >= 1) {
        return { ok: false, reason: `Condition "${sourceHandle}" output can only connect to one node.`,
          }
      }
    } else if (isTelegramApprovalSource) {
      if (!['approved', 'rejected', 'error'].includes(sourceHandle || '')) {
          return {
            ok: false,
            reason:
              'Telegram Approval must connect from Approved, Rejected, or Alert outputs.',
          }
        }
        if (outgoingFromSameHandle.length >= 1) {
          return {
            ok: false,
            reason: `Telegram Approval "${sourceHandle}" output can only connect to one node.`,
          }
        }
      } else {
        if (
          ['true', 'false', 'approved', 'rejected'].includes(sourceHandle || '')
        ) {
        return { ok: false, reason:
              'That branch output is reserved for Condition or Telegram Approval nodes.',
          }
      }
      if (sourceHandle === 'error' && isTriggerNode(sourceType)) {
        return { ok: false, reason: 'Trigger nodes do not have an Alert output.',
          }
      }
      if (
          (sourceType === 'action_send_email' ||
            (sourceType === 'action_telegram' && !isTelegramApprovalSource)) &&
          sourceHandle === 'error') {
        return { ok: false, reason: 'Notification nodes do not support an Alert output.',
          }
      }
      if (!isTriggerNode(sourceType) && outgoingFromSameHandle.length >= 1) {
        const handleLabel = sourceHandle === 'error' ? 'Alert' : 'Next'
        return { ok: false, reason: `"${sourceData.label}" ${handleLabel} output can only connect to one node.`,
          }
      }
    }

    // Prevent cycles by checking whether target already reaches source
    const adjacency = new Map<string, string[]>()
    for (const node of nodes) {
      adjacency.set(node.id, [])
    }
    for (const edge of currentEdges) {
      const list = adjacency.get(edge.source) || []
      list.push(edge.target)
      adjacency.set(edge.source, list)
    }
    const candidateChildren = adjacency.get(sourceId) || []
    candidateChildren.push(targetId)
    adjacency.set(sourceId, candidateChildren)

    const stack = [targetId]
    const seen = new Set<string>()
    while (stack.length > 0) {
      const current = stack.pop()!
      if (current === sourceId) {
        return { ok: false, reason: 'This connection creates a cycle. Workflows must stay acyclic.',
          }
      }
      if (seen.has(current)) continue
      seen.add(current)
      for (const next of adjacency.get(current) || []) {
        if (!seen.has(next)) stack.push(next)
      }
    }

    return { ok: true }
  }, [getNodeById, nodes],
  )

  const validateCurrentGraphConnections = useCallback((): string[] => {
    const issues: string[] = []
    const accepted: WorkflowEdge[] = []

    for (const edge of edges) {
      const result = checkConnection({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null,
      }, accepted,
      )

      if (!result.ok) {
        issues.push(`Invalid connection (${edge.source} -> ${edge.target}): ${result.reason}`,
        )
      } else {
        accepted.push(edge)
      }
    }

    return issues
  }, [edges, checkConnection])

  const handleDeleteEdgeById = useCallback((edgeId: string) => {
    pushHistory()
    setEdges((eds) => eds.filter((edge) => edge.id !== edgeId))
    toast({
      title: 'Connection deleted',
      description: 'The link between nodes was removed.',
    })
  }, [pushHistory, setEdges, toast],
  )

  const handleSelectEdgeById = useCallback((edgeId: string) => {
    setSelectedNode(null)
    setEdges((currentEdges) => currentEdges.map((edge) => ({
      ...edge,
      selected: edge.id === edgeId,
    })))
  }, [setEdges])

  // Connection handler
  const onConnect = useCallback(
    (params: Connection) => {
      const validation = checkConnection(params, edges)
      if (!validation.ok) {
        toast({
          title: 'Connection blocked',
          description: validation.reason,
          variant: 'destructive',
        })
        return
      }

      pushHistory()
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'custom',
            animated: true,
            data: {
              label: getEdgeLabelFromSourceHandle(params.sourceHandle ?? null),
            },
            style: getEdgeStyleFromSourceHandle(params.sourceHandle ?? null),
          },
          eds,
        ),
      )
    },
    [setEdges, pushHistory, checkConnection, edges, toast],
  )

  const isValidConnection: IsValidConnection = useCallback(
    (connection) => checkConnection(connection, edges).ok,
    [checkConnection, edges],
  )

  const handleEdgeDoubleClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault()
      event.stopPropagation()
      handleDeleteEdgeById(edge.id)
    },
    [handleDeleteEdgeById],
  )

  const getCanvasCenterPosition = useCallback(() => {
    if (reactFlowWrapper.current && reactFlowInstance) {
      const bounds = reactFlowWrapper.current.getBoundingClientRect()
      return reactFlowInstance.screenToFlowPosition({
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      })
    }
    return { x: 250, y: 250 }
  }, [reactFlowInstance])

  const addNodeToCanvas = useCallback((type: WorkflowNodeType, label: string, position?: { x: number; y: number },
    ) => {
    // Enforce single trigger
    if (isTriggerNode(type)) {
      const existingTrigger = nodes.find((n) => {
        const d = n.data as unknown as WorkflowNodeData
        return isTriggerNode(d.type)
      })
      if (existingTrigger) {
        toast({
          title: 'Only one trigger allowed',
          description: 'Remove the existing trigger before adding a new one.',
          variant: 'destructive',
        })
        return
      }
    }

    // Max 25 nodes
    if (nodes.length >= 25) {
      toast({
        title: 'Node limit reached',
        description: 'Maximum 25 nodes per workflow.',
        variant: 'destructive',
      })
      return
    }

    const basePosition = position || getCanvasCenterPosition()
    const spread = Math.min(nodes.length, 10) * 18
    const finalPosition = {
      x: basePosition.x + spread,
      y: basePosition.y + spread * 0.35,
    }

    pushHistory()

    const newNode: WorkflowNode = {
      id: getNextNodeId(),
      type: isTriggerNode(type) ? 'trigger' : 'action',
      position: finalPosition,
      data: {
        type,
        label,
        config: getDefaultConfig(type),
      } as WorkflowNodeData,
    }

    setNodes((nds) => nds.concat(newNode))
  }, [nodes, toast, pushHistory, getCanvasCenterPosition, setNodes],
  )

  // Drag & drop handler
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const type = event.dataTransfer.getData('application/reactflow-type',
      ) as WorkflowNodeType
      const label = event.dataTransfer.getData('application/reactflow-label')
      if (!type) return

      const position = reactFlowInstance?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }) || { x: 250, y: 250 }

      addNodeToCanvas(type, label, position)
    },
    [reactFlowInstance, addNodeToCanvas],
  )

  // Node selection
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setEdges((currentEdges) => currentEdges.map((edge) => (
        edge.selected ? { ...edge, selected: false } : edge
      )))
      setSelectedNode(node as WorkflowNode)
    },
    [setEdges])

  const onPaneClick = useCallback(() => {
    setEdges((currentEdges) => currentEdges.map((edge) => (
      edge.selected ? { ...edge, selected: false } : edge
    )))
    setSelectedNode(null)
  }, [setEdges])

  // Node config update
  const handleNodeUpdate = useCallback(
    (nodeId: string, data: Partial<WorkflowNodeData>) => {
      pushHistory()
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId) {
            return { ...n, data: { ...n.data, ...data } }
          }
          return n
        }),
      )
      // Update selected node reference
      setSelectedNode((prev) => {
        if (prev?.id === nodeId) {
          return { ...prev, data: { ...prev.data, ...data } }
        }
        return prev
      })
    },
    [setNodes, pushHistory],
  )

  // Node delete
  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      pushHistory()
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
      )
      setSelectedNode(null)
    },
    [setNodes, setEdges, pushHistory],
  )

  // Wrap changes to push history on delete/move
  const handleNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      const hasRemoveOrPosition = changes.some(
        (c) => c.type === 'remove' || (c.type === 'position' && c.dragging === false),
      )
      if (hasRemoveOrPosition) pushHistory()
      onNodesChange(changes as NodeChange<WorkflowNode>[])
    },
    [onNodesChange, pushHistory],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      const hasRemove = changes.some((c) => c.type === 'remove')
      if (hasRemove) pushHistory()
      onEdgesChange(changes as EdgeChange<WorkflowEdge>[])
    },
    [onEdgesChange, pushHistory],
  )

  // Save
  const handleSave = useCallback(async () => {
    // Validate: at least 1 trigger
    const triggerCount = nodes.filter((n) => {
      const d = n.data as unknown as WorkflowNodeData
      return isTriggerNode(d.type)
    }).length

    if (triggerCount !== 1) {
      toast({
        title: 'Validation Error',
        description: 'Workflow must have exactly one trigger node.',
        variant: 'destructive',
      })
      return
    }

    const connectionIssues = validateCurrentGraphConnections()
    if (connectionIssues.length > 0) {
      toast({
        title: 'Invalid workflow connections',
        description: connectionIssues[0],
        variant: 'destructive',
      })
      return
    }

    try {
      const validateRes = await fetch('/api/automations/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_graph: { nodes, edges } }),
      })
      if (validateRes.ok) {
        const validation = await validateRes.json()
        if (!validation.valid) {
          const firstError = Array.isArray(validation.errors) ? validation.errors[0] : null
          toast({
            title: 'Validation Error',
            description: firstError?.message || 'Workflow validation failed.',
            variant: 'destructive',
          })
          return
        }
      }
    } catch {
      // Non-blocking: save endpoint will still validate required fields.
    }

    setIsSaving(true)
    try {
      await onSave({ nodes, edges }, automationName, isActive)
      toast({ title: 'Saved', description: 'Workflow saved successfully.' })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error && error.message ? error.message : 'Failed to save workflow.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }, [nodes, edges, automationName, isActive, onSave, toast, validateCurrentGraphConnections,
  ])

  // Auto-layout (simple dagre-like top-down)
  const handleAutoLayout = useCallback(() => {
    pushHistory()

    // Find trigger node as root
    const triggerNode = nodes.find((n) => {
      const d = n.data as unknown as WorkflowNodeData
      return isTriggerNode(d.type)
    })

    if (!triggerNode) return

    // BFS layout
    const adjacency = new Map<string, string[]>()
    for (const edge of edges) {
      const sources = adjacency.get(edge.source) || []
      sources.push(edge.target)
      adjacency.set(edge.source, sources)
    }

    const visited = new Set<string>()
    const levels = new Map<string, number>()
    const queue: { id: string; level: number }[] = [{ id: triggerNode.id, level: 0 },
    ]

    while (queue.length > 0) {
      const { id, level } = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      levels.set(id, level)

      const children = adjacency.get(id) || []
      for (const child of children) {
        if (!visited.has(child)) {
          queue.push({ id: child, level: level + 1 })
        }
      }
    }

    // Group by level
    const levelGroups = new Map<number, string[]>()
    for (const [id, level] of levels) {
      const group = levelGroups.get(level) || []
      group.push(id)
      levelGroups.set(level, group)
    }

    // Position nodes
    const xGap = 230
    const yGap = 130
    const updatedNodes = nodes.map((n) => {
      const level = levels.get(n.id)
      if (level === undefined) return n

      const group = levelGroups.get(level)!
      const index = group.indexOf(n.id)
      const totalWidth = (group.length - 1) * xGap
      const startX = 300 - totalWidth / 2

      return {
        ...n,
        position: {
          x: startX + index * xGap,
          y: 50 + level * yGap,
        },
      }
    })

    setNodes(updatedNodes)
  }, [nodes, edges, setNodes, pushHistory])

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0d0f17]">
      <WorkflowToolbar
        automationName={automationName}
        isActive={isActive}
        isSaving={isSaving}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onBack={onBack}
        onSave={handleSave}
        onToggleActive={() => setIsActive(!isActive)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onAutoLayout={handleAutoLayout}
        onNameChange={setAutomationName}
      />

      <div className="automation-canvas-shell flex flex-1 overflow-hidden border-t border-white/[0.02]">
        <WorkflowSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          onAddNode={addNodeToCanvas}
        />

        <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_50%_-20%,rgba(103,232,249,.08),transparent_38%),linear-gradient(180deg,#0e1119,#0b0d14)]" ref={reactFlowWrapper}>
          <EdgeActionsProvider
            onDeleteEdge={handleDeleteEdgeById}
            onSelectEdge={handleSelectEdgeById}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onEdgeDoubleClick={handleEdgeDoubleClick}
              onInit={setReactFlowInstance}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ type: 'custom', animated: true }}
              connectionMode={ConnectionMode.Strict}
              fitView
              deleteKeyCode={['Backspace', 'Delete']}
              className=""
              style={{ background: 'transparent' }}
            >
            <div className="pointer-events-none absolute left-1/2 top-4 z-20 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/[0.07] bg-[#151722]/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 shadow-[0_12px_30px_rgba(0,0,0,.22)] backdrop-blur-xl sm:flex">
              <span className="size-1.5 rounded-full bg-cyan-300/70 shadow-[0_0_10px_rgba(103,232,249,.7)]" />
              Drag from an output port to connect the next step
            </div>
            <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 rounded-xl border border-white/[0.07] bg-[#151722]/90 px-3 py-2 text-[10px] leading-4 text-white/50 shadow-xl backdrop-blur-xl sm:hidden">
              Tap a node to configure it. Use Add step to extend the journey.
            </div>
            <Controls className="automation-canvas-controls !overflow-hidden !rounded-xl !border !border-white/[0.08] !bg-[#151722]/90 !text-white/70 !shadow-[0_16px_40px_rgba(0,0,0,.3)] !backdrop-blur-xl" />
            <div className="hidden sm:block">
              <MiniMap
                className="!overflow-hidden !rounded-2xl !border !border-white/[0.08] !bg-[#151722]/90 !shadow-[0_16px_40px_rgba(0,0,0,.28)]"
                nodeColor={(n) => {
                  const d = n.data as unknown as WorkflowNodeData
                  if (isTriggerNode(d.type)) return '#38BDF8'
                  if (d.type === 'action_condition') return '#10B981'
                  if (d.type === 'action_delay') return '#F59E0B'
                  if (d.type === 'action_ai_response') return '#FB7185'
                  if (d.type === 'action_send_dm' || d.type === 'action_reply_comment' || d.type === 'action_private_reply') return '#FB7185'
                  return '#38BDF8'
                }}
              />
            </div>
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.065)" />
            </ReactFlow>
          </EdgeActionsProvider>
        </div>

        {selectedNode && (
          <>
            <div className="hidden sm:block">
              <NodeConfigPanel
                node={selectedNode}
                onUpdate={handleNodeUpdate}
                onClose={() => setSelectedNode(null)}
                onDelete={handleNodeDelete}
              />
            </div>
            <div className="sm:hidden">
              <button
                type="button"
                aria-label="Close step inspector"
                className="absolute inset-0 z-20 bg-black/45 backdrop-blur-[2px]"
                onClick={() => setSelectedNode(null)}
              />
              <NodeConfigPanel
                mobile
                node={selectedNode}
                onUpdate={handleNodeUpdate}
                onClose={() => setSelectedNode(null)}
                onDelete={handleNodeDelete}
              />
            </div>
          </>
        )}
      </div>
      <style jsx global>{`
        .automation-canvas-shell .automation-sidebar-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .automation-canvas-shell .automation-sidebar-scroll::-webkit-scrollbar {
          width: 0;
          height: 0;
        }

        .automation-canvas-shell .react-flow {
          overflow: hidden !important;
        }

        .automation-canvas-shell .react-flow__controls {
          left: 12px !important;
          bottom: calc(12px + env(safe-area-inset-bottom)) !important;
          overflow: hidden;
          border-radius: 14px;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
        }

        @media (min-width: 640px) {
          .automation-canvas-shell .react-flow__controls {
            left: 15px !important;
            bottom: 15px !important;
          }
        }

        .automation-canvas-shell .react-flow__controls-button {
          background: rgba(21, 23, 34, 0.94) !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
          color: rgba(255, 255, 255, 0.8) !important;
          width: 30px !important;
          height: 30px !important;
          transition:
            background 0.15s ease,
            color 0.15s ease;
        }

        .automation-canvas-shell .react-flow__controls-button svg {
          fill: currentColor !important;
          color: currentColor !important;
        }

        .automation-canvas-shell .react-flow__controls-button:hover {
          background: rgba(34, 211, 238, 0.12) !important;
          color: #67e8f9 !important;
        }

        .automation-canvas-shell .react-flow__controls-button:last-child {
          border-bottom: 0 !important;
        }

        .automation-canvas-shell .react-flow__controls-button:disabled {
          background: rgba(21, 23, 34, 0.94) !important;
          color: rgba(255, 255, 255, 0.35) !important;
        }
      `}</style>
    </div>
  )
}
