"use client"

import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type ReactFlowInstance,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { TriggerNode } from './nodes/trigger-node'
import { ActionNode } from './nodes/action-node'
import { CustomEdge } from './edges/custom-edge'
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
  onSave: (graph: WorkflowGraph, name: string, isActive: boolean) => Promise<void>
  onBack: () => void
}

let nodeIdCounter = 0
function getNextNodeId() {
  return `node-${Date.now()}-${++nodeIdCounter}`
}

export function WorkflowCanvas({
  automationId,
  automationName: initialName,
  isActive: initialActive,
  initialGraph,
  onSave,
  onBack,
}: WorkflowCanvasProps) {
  const { toast } = useToast()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph?.nodes || [])
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph?.edges || [])

  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
  const [automationName, setAutomationName] = useState(initialName)
  const [isActive, setIsActive] = useState(initialActive)
  const [isSaving, setIsSaving] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)


  // Track undo/redo history
  const [history, setHistory] = useState<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const pushHistory = useCallback(() => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      })
      return newHistory.slice(-50) // keep last 50
    })
    setHistoryIndex(prev => Math.min(prev + 1, 49))
  }, [nodes, edges, historyIndex])

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return
    const prev = history[historyIndex - 1]
    if (prev) {
      setNodes(prev.nodes)
      setEdges(prev.edges)
      setHistoryIndex(i => i - 1)
    }
  }, [history, historyIndex, setNodes, setEdges])

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return
    const next = history[historyIndex + 1]
    if (next) {
      setNodes(next.nodes)
      setEdges(next.edges)
      setHistoryIndex(i => i + 1)
    }
  }, [history, historyIndex, setNodes, setEdges])

  // Connection handler
  const onConnect = useCallback(
    (params: Connection) => {
      pushHistory()
      setEdges((eds) =>
        addEdge(
          { ...params, type: 'custom', animated: true },
          eds,
        ),
      )
    },
    [setEdges, pushHistory],
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

  const addNodeToCanvas = useCallback((type: WorkflowNodeType, label: string, position?: { x: number; y: number }) => {
    // Enforce single trigger
    if (isTriggerNode(type)) {
      const existingTrigger = nodes.find(n => {
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
  }, [nodes, toast, pushHistory, getCanvasCenterPosition, setNodes])

  // Drag & drop handler
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const type = event.dataTransfer.getData('application/reactflow-type') as WorkflowNodeType
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
      setSelectedNode(node as WorkflowNode)
    },
    [],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

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
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
      setSelectedNode(null)
    },
    [setNodes, setEdges, pushHistory],
  )

  // Wrap changes to push history on delete/move
  const handleNodesChange = useCallback(
    (changes: any[]) => {
      const hasRemoveOrPosition = changes.some(
        (c: any) => c.type === 'remove' || (c.type === 'position' && c.dragging === false)
      )
      if (hasRemoveOrPosition) pushHistory()
      onNodesChange(changes)
    },
    [onNodesChange, pushHistory],
  )

  const handleEdgesChange = useCallback(
    (changes: any[]) => {
      const hasRemove = changes.some((c: any) => c.type === 'remove')
      if (hasRemove) pushHistory()
      onEdgesChange(changes)
    },
    [onEdgesChange, pushHistory],
  )

  // Save
  const handleSave = useCallback(async () => {
    // Validate: at least 1 trigger
    const triggerCount = nodes.filter(n => {
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

    setIsSaving(true)
    try {
      await onSave({ nodes, edges }, automationName, isActive)
      toast({ title: 'Saved', description: 'Workflow saved successfully.' })
    } catch {
      toast({ title: 'Error', description: 'Failed to save workflow.', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }, [nodes, edges, automationName, isActive, onSave, toast])

  // Auto-layout (simple dagre-like top-down)
  const handleAutoLayout = useCallback(() => {
    pushHistory()

    // Find trigger node as root
    const triggerNode = nodes.find(n => {
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
    const queue: { id: string; level: number }[] = [{ id: triggerNode.id, level: 0 }]

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
    const xGap = 250
    const yGap = 150
    const updatedNodes = nodes.map(n => {
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
    <div className="flex flex-col h-full">
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

      <div className="flex flex-1 overflow-hidden automation-canvas-shell">
        <WorkflowSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(c => !c)}
          onAddNode={addNodeToCanvas}
        />

        <div className="flex-1 relative overflow-hidden" ref={reactFlowWrapper} style={{ background: '#11131c' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: 'custom', animated: true }}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            className=""
            style={{ background: '#11131c' }}
          >
            <Controls
              className="shadow-md! automation-canvas-controls"
              style={{ background: '#151620', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)' }}
            />
            <MiniMap
              className=""
              style={{ background: '#151620', border: '1px solid rgba(255,255,255,0.08)' }}
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
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="rgba(255,255,255,0.08)" />
          </ReactFlow>
        </div>

        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={handleNodeUpdate}
            onClose={() => setSelectedNode(null)}
            onDelete={handleNodeDelete}
          />
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
          overflow: hidden;
          border-radius: 12px;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
        }

        .automation-canvas-shell .react-flow__controls-button {
          background: #1b1d28 !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
          color: rgba(255, 255, 255, 0.8) !important;
          width: 30px !important;
          height: 30px !important;
          transition: background 0.15s ease, color 0.15s ease;
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
          background: #1b1d28 !important;
          color: rgba(255, 255, 255, 0.35) !important;
        }
      `}</style>
    </div>
  )
}
