import type {
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeData,
  WorkflowNodeType,
} from '@/types/automation-graph'
import { getDefaultConfig } from '@/types/automation-graph'

export function templateNode(
  id: string,
  type: WorkflowNodeType,
  label: string,
  position: { x: number; y: number },
  configOverrides: Record<string, unknown> = {},
): WorkflowNode {
  const baseConfig = getDefaultConfig(type) as unknown as Record<string, unknown>
  return {
    id,
    type: type.startsWith('trigger_') ? 'trigger' : 'action',
    position,
    data: {
      type,
      label,
      config: { ...baseConfig, ...configOverrides },
    } as unknown as WorkflowNodeData,
  }
}

export function templateEdge(
  id: string,
  source: string,
  target: string,
  label?: string,
): WorkflowEdge {
  return {
    id,
    source,
    target,
    type: 'custom',
    animated: true,
    data: label ? { label } : undefined,
  }
}

export function buildGraphFromBlueprint(
  nodesBlueprint: Array<{
    key: string
    type: WorkflowNodeType
    label: string
    position: { x: number; y: number }
    config?: Record<string, unknown>
  }>,
  edgesBlueprint: Array<{ source: string; target: string; label?: string }>,
): WorkflowGraph {
  const prefix = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const keyToId = new Map<string, string>()
  const nodes: WorkflowNode[] = nodesBlueprint.map((node) => {
    const id = `${prefix}-${node.key}`
    keyToId.set(node.key, id)
    return templateNode(id, node.type, node.label, node.position, node.config || {})
  })
  const edges: WorkflowEdge[] = edgesBlueprint.map((edge, index) =>
    templateEdge(
      `${prefix}-edge-${index + 1}`,
      keyToId.get(edge.source) || edge.source,
      keyToId.get(edge.target) || edge.target,
      edge.label,
    ),
  )
  return { nodes, edges }
}
