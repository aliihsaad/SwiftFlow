import { NextRequest, NextResponse } from 'next/server'
import type { WorkflowGraph } from '@/types/automation-graph'
import { isTriggerNode } from '@/types/automation-graph'

interface ValidationError {
  code: string
  message: string
  nodeId?: string
}

interface ValidationWarning {
  code: string
  message: string
  nodeId?: string
}

const TEMP_DISABLED_NODE_TYPES = new Set([
  'trigger_story_mention',
  'action_http_request',
])

function validateGraph(graph: WorkflowGraph): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  if (!graph.nodes || !Array.isArray(graph.nodes)) {
    errors.push({ code: 'INVALID_GRAPH', message: 'Graph must contain a nodes array.' })
    return { errors, warnings }
  }

  // 1. Exactly 1 trigger node
  const triggerNodes = graph.nodes.filter(n => isTriggerNode(n.data?.type))
  if (triggerNodes.length === 0) {
    errors.push({ code: 'NO_TRIGGER', message: 'Workflow must have exactly one trigger node.' })
  } else if (triggerNodes.length > 1) {
    errors.push({
      code: 'MULTIPLE_TRIGGERS',
      message: 'Only one trigger node is allowed.',
      nodeId: triggerNodes[1].id,
    })
  }

  // 2. Max 25 nodes
  if (graph.nodes.length > 25) {
    errors.push({ code: 'TOO_MANY_NODES', message: 'Maximum 25 nodes per workflow.' })
  }

  // 2b. Connection topology/handle validation
  {
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
    const incomingByTarget = new Map<string, number>()
    const outgoingHandleCounts = new Map<string, number>()

    for (const edge of graph.edges || []) {
      const sourceNode = nodeById.get(edge.source)
      const targetNode = nodeById.get(edge.target)

      if (!sourceNode || !targetNode) {
        errors.push({
          code: 'INVALID_EDGE',
          message: 'A connection references a missing node.',
        })
        continue
      }

      if (edge.source === edge.target) {
        errors.push({
          code: 'SELF_LOOP',
          message: 'A node cannot connect to itself.',
          nodeId: edge.source,
        })
      }

      const sourceType = String(sourceNode.data?.type || '')
      const targetType = String(targetNode.data?.type || '')
      const sourceHandle = String(edge.sourceHandle || '')
      const handleKey = `${edge.source}:${sourceHandle || '__default__'}`

      if (isTriggerNode(targetType)) {
        errors.push({
          code: 'TRIGGER_HAS_INCOMING',
          message: 'Trigger nodes cannot have incoming connections.',
          nodeId: edge.target,
        })
      }

      incomingByTarget.set(edge.target, (incomingByTarget.get(edge.target) || 0) + 1)

      if (sourceHandle === 'error' && targetType !== 'action_send_email') {
        errors.push({
          code: 'ALERT_TARGET_INVALID',
          message: 'Alert connections can only target a Send Email node.',
          nodeId: edge.target,
        })
      }

      if (sourceType === 'action_condition') {
        if (!['true', 'false', 'error'].includes(sourceHandle)) {
          errors.push({
            code: 'INVALID_CONDITION_HANDLE',
            message: 'Condition node outputs must use True, False, or Alert.',
            nodeId: edge.source,
          })
        }
        outgoingHandleCounts.set(handleKey, (outgoingHandleCounts.get(handleKey) || 0) + 1)
      } else {
        if (sourceHandle === 'true' || sourceHandle === 'false') {
          errors.push({
            code: 'INVALID_SOURCE_HANDLE',
            message: 'Only Condition nodes can use True/False outputs.',
            nodeId: edge.source,
          })
        }
        if (isTriggerNode(sourceType) && sourceHandle === 'error') {
          errors.push({
            code: 'TRIGGER_ALERT_INVALID',
            message: 'Trigger nodes do not have an Alert output.',
            nodeId: edge.source,
          })
        }
        if (sourceType === 'action_send_email' && sourceHandle === 'error') {
          errors.push({
            code: 'SEND_EMAIL_ALERT_INVALID',
            message: 'Send Email node does not support an Alert output.',
            nodeId: edge.source,
          })
        }
        if (!isTriggerNode(sourceType)) {
          outgoingHandleCounts.set(handleKey, (outgoingHandleCounts.get(handleKey) || 0) + 1)
        }
      }
    }

    for (const [targetId, count] of incomingByTarget) {
      if (count > 1) {
        errors.push({
          code: 'MULTIPLE_INCOMING',
          message: 'Each action node can only have one incoming connection.',
          nodeId: targetId,
        })
      }
    }

    for (const [key, count] of outgoingHandleCounts) {
      if (count > 1) {
        const [nodeId] = key.split(':')
        errors.push({
          code: 'MULTIPLE_HANDLE_OUTPUTS',
          message: 'Each node output handle can only connect to one node.',
          nodeId,
        })
      }
    }
  }

  // 3. All non-trigger nodes must be reachable from trigger
  if (triggerNodes.length === 1) {
    const reachable = new Set<string>()
    const adjacency = new Map<string, string[]>()

    for (const edge of graph.edges || []) {
      const sources = adjacency.get(edge.source) || []
      sources.push(edge.target)
      adjacency.set(edge.source, sources)
    }

    const queue = [triggerNodes[0].id]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (reachable.has(current)) continue
      reachable.add(current)
      const children = adjacency.get(current) || []
      for (const child of children) {
        if (!reachable.has(child)) queue.push(child)
      }
    }

    for (const node of graph.nodes) {
      if (!isTriggerNode(node.data?.type) && !reachable.has(node.id)) {
        errors.push({
          code: 'UNREACHABLE_NODE',
          message: `Node "${node.data?.label || node.id}" is not reachable from the trigger.`,
          nodeId: node.id,
        })
      }
    }
  }

  // 4. No cycles (DAG check via topological sort)
  {
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()

    for (const node of graph.nodes) {
      inDegree.set(node.id, 0)
      adjacency.set(node.id, [])
    }

    for (const edge of graph.edges || []) {
      adjacency.get(edge.source)?.push(edge.target)
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    }

    const queue = [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([id]) => id)
    let visited = 0

    while (queue.length > 0) {
      const current = queue.shift()!
      visited++
      for (const child of adjacency.get(current) || []) {
        const newDeg = (inDegree.get(child) || 1) - 1
        inDegree.set(child, newDeg)
        if (newDeg === 0) queue.push(child)
      }
    }

    if (visited < graph.nodes.length) {
      errors.push({ code: 'CYCLE_DETECTED', message: 'Workflow contains a cycle. Cycles are not allowed.' })
    }
  }

  // 5. Required fields per node type
  for (const node of graph.nodes) {
    const config = node.data?.config as unknown as Record<string, unknown> | undefined
    if (!config) continue

    if (TEMP_DISABLED_NODE_TYPES.has(String(node.data?.type || ''))) {
      const label = String(node.data?.label || node.data?.type || 'This node')
      errors.push({
        code: 'NODE_TEMPORARILY_DISABLED',
        message: `${label} is temporarily disabled and cannot be used right now.`,
        nodeId: node.id,
      })
      continue
    }

    switch (node.data?.type) {
      case 'trigger_new_comment':
        if (!config.post_id) {
          errors.push({ code: 'MISSING_FIELD', message: 'Comment trigger requires a post ID.', nodeId: node.id })
        }
        if (!config.social_account_id) {
          errors.push({ code: 'MISSING_FIELD', message: 'Comment trigger requires an account.', nodeId: node.id })
        }
        break
      case 'trigger_new_message':
      case 'trigger_story_mention':
        if (!config.social_account_id) {
          errors.push({ code: 'MISSING_FIELD', message: 'Trigger requires an account.', nodeId: node.id })
        }
        break
      case 'action_send_dm':
        if (config.use_ai_response !== true && !config.opening_message) {
          errors.push({ code: 'MISSING_FIELD', message: 'Send DM requires an opening message.', nodeId: node.id })
        }
        if (config.use_ai_response === true && !config.opening_message) {
          warnings.push({
            code: 'AI_RESPONSE_DM_NO_FALLBACK',
            message: 'Send DM is set to use AI response with no fallback message. If AI generation fails, DM will fail.',
            nodeId: node.id,
          })
        }
        if (config.cta_mode === 'button' && config.link_url && !config.button_text && config.use_ai_cta !== true) {
          warnings.push({
            code: 'CTA_BUTTON_DEFAULT_TITLE',
            message: 'CTA button text is empty. Default "Open Link" will be used.',
            nodeId: node.id,
          })
        }
        if (config.use_ai_cta === true && !config.link_url) {
          warnings.push({
            code: 'AI_CTA_NO_MANUAL_FALLBACK',
            message: 'Send DM CTA is set to use AI CTA only. Add manual link URL as fallback for reliability.',
            nodeId: node.id,
          })
        }
        break
      case 'action_private_reply':
        if (config.use_ai_response !== true && !config.message) {
          errors.push({ code: 'MISSING_FIELD', message: 'Private Reply requires a message.', nodeId: node.id })
        }
        if (config.use_ai_response === true && !config.message) {
          warnings.push({
            code: 'AI_RESPONSE_PRIVATE_REPLY_NO_FALLBACK',
            message: 'Private Reply is set to use AI response with no fallback message.',
            nodeId: node.id,
          })
        }
        break
      case 'action_reply_comment': {
        const fallbackMessages = Array.isArray(config.messages)
          ? config.messages.map((m) => String(m || '').trim()).filter(Boolean)
          : []

        if (config.use_ai_response !== true && fallbackMessages.length === 0) {
          errors.push({ code: 'MISSING_FIELD', message: 'Reply to Comment requires at least one reply message.', nodeId: node.id })
        }
        if (config.use_ai_response === true && fallbackMessages.length === 0) {
          warnings.push({
            code: 'AI_RESPONSE_REPLY_COMMENT_NO_FALLBACK',
            message: 'Reply to Comment is set to use AI response with no fallback reply.',
            nodeId: node.id,
          })
        }
        break
      }
      case 'action_http_request':
        if (!config.url) {
          errors.push({ code: 'MISSING_FIELD', message: 'HTTP Request requires a URL.', nodeId: node.id })
        }
        break
      case 'action_ai_response':
        if (!config.prompt_template && !config.preset_goal) {
          warnings.push({
            code: 'AI_USING_DEFAULT_PROMPT',
            message: 'AI Response will use built-in defaults since no custom prompt/preset is set.',
            nodeId: node.id,
          })
        }
        if (config.include_cta === true && !config.cta_link_url) {
          warnings.push({
            code: 'AI_CTA_NO_LINK_URL',
            message: 'AI CTA is enabled but no CTA link URL is set.',
            nodeId: node.id,
          })
        }
        if (config.include_cta === true && config.cta_mode === 'button' && !config.cta_button_text) {
          warnings.push({
            code: 'AI_CTA_BUTTON_DEFAULT_TITLE',
            message: 'AI CTA button mode is enabled without button text. Default "Open Link" will be used.',
            nodeId: node.id,
          })
        }
        break
    }
  }

  // 6. Non-comment trigger with private-reply path warning
  if (triggerNodes.length === 1 && triggerNodes[0].data?.type !== 'trigger_new_comment') {
    const adjacency = new Map<string, string[]>()
    for (const edge of graph.edges || []) {
      const sources = adjacency.get(edge.source) || []
      sources.push(edge.target)
      adjacency.set(edge.source, sources)
    }

    const reachable = new Set<string>()
    const queue = [triggerNodes[0].id]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (reachable.has(current)) continue
      reachable.add(current)
      for (const child of adjacency.get(current) || []) {
        if (!reachable.has(child)) queue.push(child)
      }
    }

    for (const node of graph.nodes) {
      if (node.data?.type === 'action_private_reply' && reachable.has(node.id)) {
        warnings.push({
          code: 'PRIVATE_REPLY_NON_COMMENT_TRIGGER',
          message: 'Private Reply requires comment context and will fail on this trigger path.',
          nodeId: node.id,
        })
      }
    }
  }

  return { errors, warnings }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workflow_graph } = body

    if (!workflow_graph) {
      return NextResponse.json({ error: 'Missing workflow_graph' }, { status: 400 })
    }

    const result = validateGraph(workflow_graph as WorkflowGraph)

    return NextResponse.json({
      valid: result.errors.length === 0,
      errors: result.errors,
      warnings: result.warnings,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Validation failed' },
      { status: 500 },
    )
  }
}
