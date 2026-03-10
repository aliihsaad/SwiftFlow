// @ts-nocheck - Deno runtime
/**
 * Graph-based workflow executor for canvas-mode automations.
 *
 * Traverses the workflow DAG starting from the trigger node,
 * executing each node in sequence and handling branching for
 * condition nodes and parallel edges.
 */
import { invokeEdgeFunction } from "../_shared/edge-invoke.ts"
import { buildAutomationAiPrompt, interpolateTemplate } from "../_shared/automation-context.ts"
import { sendResendEmail, textToSimpleHtml } from "../_shared/resend-email.ts"
import { resolveAIConfig, toUserFriendlyError } from "../_shared/ai-config.ts"

const META_GRAPH_URL = 'https://graph.facebook.com/v24.0';

const DM_FALLBACK_CODES = new Set([
  '551',
  '551:1545041',
  '200:1545041',
  '10:2018108',
  '10:2534022',
  '10:2018278',
]);

const TEMP_DISABLED_ACTION_TYPES = new Set([
  'action_http_request',
]);

function isDmFallbackError(error: { code?: number; error_subcode?: number }) {
  const key1 = String(error.code);
  const key2 = `${error.code}:${error.error_subcode}`;
  return DM_FALLBACK_CODES.has(key1) || DM_FALLBACK_CODES.has(key2);
}

interface WorkflowNode {
  id: string
  type: string
  data: {
    type: string
    label: string
    config: Record<string, any>
  }
  position: { x: number; y: number }
}

interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  data?: { label?: string }
}

interface WorkflowGraph {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

interface TriggerContext {
  comment_id?: string
  post_id?: string
  commenter_id?: string
  commenter_username?: string
  comment_text?: string
  message_id?: string
  sender_id?: string
  sender_username?: string
  message_text?: string
  follower_id?: string
  follower_username?: string
  timestamp?: string
  ai_response?: string
  ai_cta_mode?: 'button' | 'text'
  ai_cta_button_text?: string
  ai_cta_link_url?: string
  ai_cta_link_message?: string
}

interface ExecutionResult {
  processed: number
  dmsSent: number
  errors: number
  nodeResults: Record<string, { success: boolean; output?: any; error?: string }>
}

function isTriggerNodeType(type: unknown): boolean {
  return String(type || '').startsWith('trigger_');
}

function validateExecutableGraph(graph: WorkflowGraph): string[] {
  const issues: string[] = [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  const triggerNodes = nodes.filter((node) => isTriggerNodeType(node?.data?.type));
  if (triggerNodes.length !== 1) {
    issues.push('Workflow must contain exactly one trigger node.');
  }

  const incomingByTarget = new Map<string, number>();
  const outgoingHandleCounts = new Map<string, number>();

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      issues.push(`Edge ${edge.id || `${edge.source}->${edge.target}`} references a missing node.`);
      continue;
    }
    if (edge.source === edge.target) {
      issues.push(`Node ${edge.source} cannot connect to itself.`);
    }

    const targetNode = nodeMap.get(edge.target);
    const sourceNode = nodeMap.get(edge.source);
    const sourceType = String(sourceNode?.data?.type || '');
    const sourceHandle = String(edge.sourceHandle || '');
    const handleKey = `${edge.source}:${sourceHandle || '__default__'}`;

    if (isTriggerNodeType(targetNode?.data?.type)) {
      issues.push(`Trigger node ${edge.target} cannot have incoming connections.`);
    }

    incomingByTarget.set(edge.target, (incomingByTarget.get(edge.target) || 0) + 1);

    if (sourceType === 'action_condition') {
      if (!['true', 'false', 'error'].includes(sourceHandle)) {
        issues.push(`Condition node ${edge.source} uses an invalid output handle.`);
      }
      outgoingHandleCounts.set(handleKey, (outgoingHandleCounts.get(handleKey) || 0) + 1);
    } else {
      if (sourceHandle === 'true' || sourceHandle === 'false') {
        issues.push(`Only Condition nodes can use True/False outputs (edge from ${edge.source}).`);
      }
      if (sourceHandle === 'error' && isTriggerNodeType(sourceType)) {
        issues.push(`Trigger node ${edge.source} cannot use an Error output.`);
      }
      if (sourceType === 'action_send_email' && sourceHandle === 'error') {
        issues.push(`Send Email node ${edge.source} cannot use an Error output.`);
      }
      if (sourceHandle === 'error' && String(targetNode?.data?.type || '') !== 'action_send_email') {
        issues.push(`Error/Alert output from ${edge.source} must target a Send Email node.`);
      }
      if (!isTriggerNodeType(sourceType)) {
        outgoingHandleCounts.set(handleKey, (outgoingHandleCounts.get(handleKey) || 0) + 1);
      }
    }
  }

  for (const [targetId, count] of incomingByTarget) {
    if (count > 1) {
      issues.push(`Node ${targetId} has multiple incoming connections. Only one is allowed.`);
    }
  }

  for (const [key, count] of outgoingHandleCounts) {
    if (count > 1) {
      issues.push(`Output handle ${key} has multiple connections. Only one per handle is allowed.`);
    }
  }

  // DAG check
  if (nodes.length > 0) {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }
    for (const edge of edges) {
      if (!adjacency.has(edge.source) || !inDegree.has(edge.target)) continue;
      adjacency.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [nodeId, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(nodeId);
    }

    let visitedCount = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      visitedCount++;
      for (const child of adjacency.get(current) || []) {
        const nextDeg = (inDegree.get(child) || 0) - 1;
        inDegree.set(child, nextDeg);
        if (nextDeg === 0) queue.push(child);
      }
    }

    if (visitedCount < nodes.length) {
      issues.push('Workflow contains a cycle. Cycles are not allowed.');
    }
  }

  // De-duplicate messages to avoid log spam
  return [...new Set(issues)];
}

function getOutgoingEdges(
  adjacency: Map<string, { targetId: string; sourceHandle?: string }[]>,
  nodeId: string,
) {
  return adjacency.get(nodeId) || [];
}

function queueEdges(
  edges: { targetId: string; sourceHandle?: string }[],
  queue: string[],
) {
  for (const edge of edges) {
    queue.push(edge.targetId);
  }
}

function queueErrorBranchIfPresent(
  adjacency: Map<string, { targetId: string; sourceHandle?: string }[]>,
  nodeId: string,
  queue: string[],
): boolean {
  const errorEdges = getOutgoingEdges(adjacency, nodeId).filter((edge) => edge.sourceHandle === 'error');
  if (!errorEdges.length) return false;
  queueEdges(errorEdges, queue);
  return true;
}

function queueStandardActionChildren(
  adjacency: Map<string, { targetId: string; sourceHandle?: string }[]>,
  nodeId: string,
  queue: string[],
  nodeSucceeded: boolean,
) {
  const outEdges = getOutgoingEdges(adjacency, nodeId);
  const nonErrorEdges = outEdges.filter((edge) => edge.sourceHandle !== 'error');

  if (nodeSucceeded) {
    queueEdges(nonErrorEdges, queue);
    return;
  }

  const hadErrorBranch = queueErrorBranchIfPresent(adjacency, nodeId, queue);
  if (!hadErrorBranch) {
    // Preserve legacy behavior: failed nodes continue on their normal path unless an explicit error edge is connected.
    queueEdges(nonErrorEdges, queue);
  }
}

const NODE_WORKER_MAP: Record<string, string> = {
  action_reply_comment: 'automation-worker-reply-comment',
  action_send_dm: 'automation-worker-send-dm',
  action_private_reply: 'automation-worker-private-reply',
  action_condition: 'automation-worker-condition',
  action_http_request: 'automation-worker-http-request',
  action_ai_response: 'automation-worker-ai-response',
  action_send_email: 'automation-worker-send-email',
};

function normalizeCommentReply(text: string, maxLength = 220): string {
  const normalized = String(text || '').replace(/\r/g, '').trim();
  if (!normalized) return '';

  if (normalized.length <= maxLength && !normalized.includes('\n')) {
    return normalized;
  }

  const quotedMatches = [...normalized.matchAll(/"([^"\n]{3,220})"/g)]
    .map((m) => String(m[1] || '').trim())
    .filter(Boolean);
  if (quotedMatches.length > 0) {
    return quotedMatches[0].slice(0, maxLength).trim();
  }

  const candidates = normalized
    .split('\n')
    .map((line) => line.replace(/^[-*#>\d.)\s]+/, '').trim())
    .filter(Boolean)
    .filter((line) => !/^okay[,!]? here are/i.test(line))
    .filter((line) => !/^general\/neutral/i.test(line))
    .filter((line) => !/^if you'?re /i.test(line))
    .filter((line) => !/^to help me /i.test(line))
    .filter((line) => !/:$/.test(line));

  const first = candidates.find((line) => line.length <= maxLength) || candidates[0] || normalized;
  return first.slice(0, maxLength).trim();
}

function pickFallbackReply(messages: unknown[], ctx: TriggerContext & { ai_response?: string }): string {
  const usable = (Array.isArray(messages) ? messages : [])
    .map((m) => String(m || '').replace(/\{\{ai_response\}\}/g, ctx.ai_response || '').trim())
    .filter(Boolean);
  if (!usable.length) return '';
  return usable[Math.floor(Math.random() * usable.length)] || '';
}

/**
 * Execute a workflow graph for a given trigger context.
 */
export async function executeWorkflowGraph(
  supabase: any,
  automation: any,
  triggerContext: TriggerContext,
  account: { account_id: string; access_token: string; metadata?: Record<string, any> },
): Promise<ExecutionResult> {
  const graph: WorkflowGraph = automation.workflow_graph;
  const result: ExecutionResult = { processed: 0, dmsSent: 0, errors: 0, nodeResults: {} };

  if (!graph?.nodes?.length) {
    console.error(`[GRAPH] Automation ${automation.id}: No graph nodes`);
    return result;
  }

  const graphIssues = validateExecutableGraph(graph);
  if (graphIssues.length > 0) {
    console.error(`[GRAPH] Automation ${automation.id}: Invalid workflow graph`, graphIssues);
    return {
      ...result,
      errors: 1,
      nodeResults: {},
    };
  }

  // Find trigger node
  const triggerNode = graph.nodes.find(n => n.data.type.startsWith('trigger_'));
  if (!triggerNode) {
    console.error(`[GRAPH] Automation ${automation.id}: No trigger node found`);
    return result;
  }

  // Build adjacency map: sourceId → [{ targetId, sourceHandle }]
  const adjacency = new Map<string, { targetId: string; sourceHandle?: string }[]>();
  for (const edge of graph.edges) {
    const list = adjacency.get(edge.source) || [];
    list.push({ targetId: edge.target, sourceHandle: edge.sourceHandle });
    adjacency.set(edge.source, list);
  }

  // BFS execution starting from trigger's children
  const pageId = account.metadata?.connected_page_id || account.account_id;
  const executionQueue: string[] = [];

  // Mutable context that accumulates outputs from previous nodes.
  // Downstream nodes can use {{ai_response}} in their templates.
  const runtimeContext: TriggerContext = { ...triggerContext };

  // Get outgoing nodes from trigger
  const triggerChildren = adjacency.get(triggerNode.id) || [];
  for (const child of triggerChildren) {
    executionQueue.push(child.targetId);
  }

  result.processed = 1; // Trigger counted

  const visited = new Set<string>();

  while (executionQueue.length > 0) {
    const nodeId = executionQueue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) continue;

    console.log(`[GRAPH] Executing node: ${node.data.type} (${node.data.label})`);

    try {
      const nodeResult = await executeNode(
        supabase, automation, node, runtimeContext, account, pageId
      );

      result.nodeResults[nodeId] = nodeResult;

      // If an AI node produced a response, make it available to downstream nodes
      if (node.data.type === 'action_ai_response' && nodeResult.success && nodeResult.output?.response) {
        runtimeContext.ai_response = nodeResult.output.response;
        runtimeContext.ai_cta_mode = nodeResult.output?.cta_mode;
        runtimeContext.ai_cta_button_text = nodeResult.output?.cta_button_text;
        runtimeContext.ai_cta_link_url = nodeResult.output?.cta_link_url;
        runtimeContext.ai_cta_link_message = nodeResult.output?.cta_link_message;
      }

      if (nodeResult.dmSent) result.dmsSent++;
      if (!nodeResult.success) result.errors++;

      // Handle condition branching
      if (node.data.type === 'action_condition') {
        const outEdges = getOutgoingEdges(adjacency, nodeId);

        if (nodeResult.success) {
          const branch = nodeResult.output?.conditionResult ? 'true' : 'false';
          for (const edge of outEdges) {
            if (edge.sourceHandle === branch) {
              executionQueue.push(edge.targetId);
            }
          }
        } else {
          const hadErrorBranch = queueErrorBranchIfPresent(adjacency, nodeId, executionQueue);
          if (!hadErrorBranch) {
            // Preserve legacy behavior: failed condition nodes fall through the "false" path
            for (const edge of outEdges) {
              if (edge.sourceHandle === 'false') {
                executionQueue.push(edge.targetId);
              }
            }
          }
        }
      }
      // Handle delay: schedule future execution and stop
      else if (node.data.type === 'action_delay') {
        const config = node.data.config;
        const delayMs = getDelayMs(config.duration_value, config.duration_unit);
        const scheduledFor = new Date(Date.now() + delayMs).toISOString();

        // Save remaining graph state for later resumption
        const remainingNodes = getOutgoingEdges(adjacency, nodeId)
          .filter((edge) => edge.sourceHandle !== 'error')
          .map((e) => e.targetId);
        if (remainingNodes.length > 0) {
          await supabase.from('automation_scheduled_executions').insert({
            automation_id: automation.id,
            execution_id: crypto.randomUUID(),
            node_id: nodeId,
            execution_context: {
              automation_id: automation.id,
              trigger_data: runtimeContext,
              next_nodes: remainingNodes,
              variables: {},
              node_outputs: result.nodeResults,
            },
            scheduled_for: scheduledFor,
            status: 'pending',
          });
          console.log(`[GRAPH] Delay node: scheduled resumption for ${scheduledFor}`);
        }
        // Don't add children to queue — they'll be executed after the delay
        continue;
      }
      // Normal node: add all children to queue
      else {
        queueStandardActionChildren(adjacency, nodeId, executionQueue, nodeResult.success);
      }
    } catch (err) {
      console.error(`[GRAPH] Error executing node ${nodeId}:`, err);
      result.nodeResults[nodeId] = { success: false, error: err?.message || 'Unknown error' };
      result.errors++;
      queueErrorBranchIfPresent(adjacency, nodeId, executionQueue);
    }
  }

  return result;
}

/**
 * Resume execution from a scheduled delay.
 */
export async function resumeFromDelay(
  supabase: any,
  scheduledExec: any,
): Promise<ExecutionResult> {
  const { automation_id, execution_context } = scheduledExec;
  const { trigger_data, next_nodes, node_outputs } = execution_context;

  // Fetch the automation
  const { data: automation, error } = await supabase
    .from('automations')
    .select('*, social_accounts(id, account_id, access_token, platform, metadata)')
    .eq('id', automation_id)
    .single();

  if (error || !automation) {
    console.error(`[GRAPH_RESUME] Automation ${automation_id} not found`);
    return { processed: 0, dmsSent: 0, errors: 1, nodeResults: {} };
  }

  if (!automation.is_active) {
    console.log(`[GRAPH_RESUME] Automation ${automation_id} is inactive, skipping`);
    return { processed: 0, dmsSent: 0, errors: 0, nodeResults: {} };
  }

  const account = automation.social_accounts;
  const graph: WorkflowGraph = automation.workflow_graph;
  const graphIssues = validateExecutableGraph(graph);
  if (graphIssues.length > 0) {
    console.error(`[GRAPH_RESUME] Automation ${automation_id} invalid workflow graph`, graphIssues);
    return { processed: 0, dmsSent: 0, errors: 1, nodeResults: { } };
  }
  const pageId = account.metadata?.connected_page_id || account.account_id;

  const result: ExecutionResult = {
    processed: 0,
    dmsSent: 0,
    errors: 0,
    nodeResults: { ...node_outputs },
  };

  // Build adjacency
  const adjacency = new Map<string, { targetId: string; sourceHandle?: string }[]>();
  for (const edge of graph.edges) {
    const list = adjacency.get(edge.source) || [];
    list.push({ targetId: edge.target, sourceHandle: edge.sourceHandle });
    adjacency.set(edge.source, list);
  }

  // Continue from the next nodes after the delay
  const runtimeContext: TriggerContext = { ...(trigger_data || {}) };
  const queue = [...(next_nodes || [])];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) continue;

    try {
      const nodeResult = await executeNode(
        supabase, automation, node, runtimeContext, account, pageId
      );
      result.nodeResults[nodeId] = nodeResult;
      if (nodeResult.dmSent) result.dmsSent++;
      if (!nodeResult.success) result.errors++;
      result.processed++;

      if (node.data.type === 'action_ai_response' && nodeResult.success && nodeResult.output?.response) {
        runtimeContext.ai_response = nodeResult.output.response;
        runtimeContext.ai_cta_mode = nodeResult.output?.cta_mode;
        runtimeContext.ai_cta_button_text = nodeResult.output?.cta_button_text;
        runtimeContext.ai_cta_link_url = nodeResult.output?.cta_link_url;
        runtimeContext.ai_cta_link_message = nodeResult.output?.cta_link_message;
      }

      if (node.data.type === 'action_condition') {
        const outEdges = getOutgoingEdges(adjacency, nodeId);

        if (nodeResult.success) {
          const branch = nodeResult.output?.conditionResult ? 'true' : 'false';
          for (const edge of outEdges) {
            if (edge.sourceHandle === branch) queue.push(edge.targetId);
          }
        } else {
          const hadErrorBranch = queueErrorBranchIfPresent(adjacency, nodeId, queue);
          if (!hadErrorBranch) {
            for (const edge of outEdges) {
              if (edge.sourceHandle === 'false') queue.push(edge.targetId);
            }
          }
        }
      } else if (node.data.type === 'action_delay') {
        // Another delay — schedule again
        const config = node.data.config;
        const delayMs = getDelayMs(config.duration_value, config.duration_unit);
        const remainingNodes = getOutgoingEdges(adjacency, nodeId)
          .filter((edge) => edge.sourceHandle !== 'error')
          .map((e) => e.targetId);
        if (remainingNodes.length > 0) {
          await supabase.from('automation_scheduled_executions').insert({
            automation_id: automation.id,
            execution_id: crypto.randomUUID(),
            node_id: nodeId,
            execution_context: {
              automation_id: automation.id,
              trigger_data: runtimeContext,
              next_nodes: remainingNodes,
              variables: {},
              node_outputs: result.nodeResults,
            },
            scheduled_for: new Date(Date.now() + delayMs).toISOString(),
            status: 'pending',
          });
        }
        continue;
      } else {
        queueStandardActionChildren(adjacency, nodeId, queue, nodeResult.success);
      }
    } catch (err) {
      result.nodeResults[nodeId] = { success: false, error: err?.message || 'Unknown error' };
      result.errors++;
      queueErrorBranchIfPresent(adjacency, nodeId, queue);
    }
  }

  return result;
}

// ─── Node Executors ──────────────────────────────────────────────

async function executeNode(
  supabase: any,
  automation: any,
  node: WorkflowNode,
  triggerContext: TriggerContext,
  account: any,
  pageId: string,
): Promise<{ success: boolean; output?: any; error?: string; dmSent?: boolean }> {
  const config = node.data.config;
  const nodeType = node.data.type;

  if (TEMP_DISABLED_ACTION_TYPES.has(nodeType)) {
    return {
      success: false,
      error: `${node.data.label || 'HTTP Request'} is temporarily disabled`,
      output: { disabled: true, nodeType },
    };
  }

  // action_delay is scheduler-controlled and should not be delegated.
  if (nodeType !== 'action_delay') {
    const workerFunction = NODE_WORKER_MAP[nodeType];
    if (workerFunction) {
      const workerResult = await invokeEdgeFunction(workerFunction, {
        workspace_id: automation.workspace_id,
        automation_id: automation.id,
        node_id: node.id,
        config,
        context: triggerContext,
        access_token: account?.access_token,
        page_id: pageId,
        platform: account?.platform,
      });

      if (workerResult.ok && workerResult.data) {
        return workerResult.data;
      }

      console.warn(`[GRAPH] Worker ${workerFunction} failed for node ${node.id}, using local fallback:`, workerResult.error);
    }
  }

  switch (nodeType) {
    case 'action_reply_comment':
      return await executeReplyComment(config, triggerContext, account.access_token, account?.platform);

    case 'action_send_dm':
      return await executeSendDM(config, triggerContext, account.access_token, pageId);

    case 'action_private_reply':
      return await executePrivateReply(config, triggerContext, account.access_token, pageId);

    case 'action_condition':
      return executeCondition(config, triggerContext);

    case 'action_delay':
      // Delay is handled in the main loop (scheduling)
      return { success: true, output: { delayed: true } };

    case 'action_http_request':
      return await executeHttpRequest(config);

    case 'action_ai_response':
      return await executeAiResponse(supabase, config, triggerContext, automation.workspace_id);

    case 'action_send_email':
      return await executeSendEmail(config, triggerContext, automation, node);

    default:
      console.warn(`[GRAPH] Unknown node type: ${node.data.type}`);
      return { success: true };
  }
}

async function executeSendEmail(
  config: any,
  ctx: TriggerContext,
  automation: any,
  node: WorkflowNode,
): Promise<{ success: boolean; output?: any; error?: string }> {
  try {
    const recipientType = String(config?.recipient_type || 'custom');
    if (recipientType !== 'custom') {
      return { success: false, error: 'Send Email node supports custom recipients only' };
    }

    const to = String(config?.recipient_email || '').trim();
    if (!to) {
      return { success: false, error: 'Email address is required' };
    }

    const subject = interpolateTemplate(String(config?.subject || ''), ctx).trim();
    const messageBody = interpolateTemplate(String(config?.body || ''), ctx).trim();

    if (!subject) {
      return { success: false, error: 'Email subject is required' };
    }

    if (!messageBody) {
      return { success: false, error: 'Email body is required' };
    }

    const footerLines = [
      '',
      '---',
      'Sent by SwiftFlow Automation',
      automation?.name ? `Automation: ${String(automation.name)}` : null,
      automation?.workspace_id ? `Workspace: ${String(automation.workspace_id)}` : null,
      automation?.id ? `Automation ID: ${String(automation.id)}` : null,
      node?.id ? `Node ID: ${String(node.id)}` : null,
    ].filter(Boolean).join('\n');

    const text = `${messageBody}${footerLines}`;

    const sendResult = await sendResendEmail({
      to,
      subject,
      text,
      html: textToSimpleHtml(text),
    });

    return {
      success: true,
      output: {
        to,
        subject,
        provider: 'resend',
        email_id: sendResult.id || null,
      },
    };
  } catch (err) {
    return { success: false, error: err?.message || 'Email send failed' };
  }
}

async function executeReplyComment(
  config: any,
  ctx: TriggerContext & { ai_response?: string },
  accessToken: string,
  platform?: string,
): Promise<{ success: boolean; output?: any; error?: string }> {
  if (!ctx.comment_id) return { success: false, error: 'No comment_id in trigger context' };

  const useAiResponse = config.use_ai_response === true;
  const aiGeneratedMessage = String(ctx.ai_response || '').trim();
  const fallbackMessage = pickFallbackReply(config.messages || [], ctx);
  let message = useAiResponse ? (aiGeneratedMessage || fallbackMessage) : fallbackMessage;
  if (!message) {
    return {
      success: false,
      error: useAiResponse
        ? 'AI response is empty and no fallback reply message is configured'
        : 'No reply messages configured',
    };
  }

  message = normalizeCommentReply(message);

  const replyPath = String(platform || '').toLowerCase() === 'facebook' ? 'comments' : 'replies';
  const url = `${META_GRAPH_URL}/${ctx.comment_id}/${replyPath}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: accessToken }),
  });

  const result = await response.json();
  if (!response.ok || result.error) {
    return { success: false, error: result.error?.message || 'Reply failed', output: { platform, replyPath, meta_error: result.error || null } };
  }

  return { success: true, output: { replyId: result.id } };
}

async function executeSendDM(
  config: any,
  ctx: TriggerContext,
  accessToken: string,
  pageId: string,
): Promise<{ success: boolean; output?: any; error?: string; dmSent?: boolean }> {
  const recipientId = ctx.commenter_id || ctx.sender_id || ctx.follower_id;
  if (!recipientId) return { success: false, error: 'No recipient ID in trigger context' };

  const useAiResponse = config.use_ai_response === true;
  const aiGeneratedMessage = String(ctx.ai_response || '').trim();
  const fallbackOpeningMessage = (config.opening_message || '')
    .replace(/\{\{ai_response\}\}/g, ctx.ai_response || '');
  const openingMessage = useAiResponse
    ? (aiGeneratedMessage || fallbackOpeningMessage)
    : fallbackOpeningMessage;

  const useAiCta = config.use_ai_cta === true;
  const fallbackCtaMode = config.cta_mode === 'text' ? 'text' : 'button';
  const effectiveCtaMode = useAiCta
    ? (
      ctx.ai_cta_mode === 'text'
        ? 'text'
        : (ctx.ai_cta_mode === 'button' ? 'button' : fallbackCtaMode)
    )
    : fallbackCtaMode;
  const effectiveLinkUrl = useAiCta
    ? (String(ctx.ai_cta_link_url || '').trim() || String(config.link_url || '').trim())
    : String(config.link_url || '').trim();
  const effectiveButtonText = useAiCta
    ? (String(ctx.ai_cta_button_text || '').trim() || String(config.button_text || '').trim() || 'Open Link')
    : (String(config.button_text || '').trim() || 'Open Link');
  const effectiveLinkMessage = useAiCta
    ? (String(ctx.ai_cta_link_message || '').trim() || String(config.link_message || '').trim())
    : String(config.link_message || '').trim();
  const buttonFallbackToText = config.cta_button_fallback_to_text !== false;

  if (!openingMessage.trim()) {
    return {
      success: false,
      error: useAiResponse
        ? 'AI response is empty and no fallback opening message is configured'
        : 'Send DM requires a non-empty opening message',
    };
  }

  const sendUrl = `${META_GRAPH_URL}/${pageId}/messages`;

  // Try normal DM
  const openingResponse = await fetch(sendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: openingMessage },
      access_token: accessToken,
    }),
  });

  const openingResult = await openingResponse.json();

  if (!openingResponse.ok || openingResult.error) {
    const dmError = openingResult?.error || {};
    const dmErrorMessage = dmError.message || 'DM failed';
    const fallbackEnabled = config.fallback_to_private_reply_on_failure === true;

    if (!fallbackEnabled) {
      return { success: false, error: dmErrorMessage };
    }

    // Fallback only on delivery-window / recipient-eligibility errors
    if (!isDmFallbackError(dmError)) {
      return { success: false, error: dmErrorMessage };
    }

    if (!ctx.comment_id) {
      return { success: false, error: 'DM fallback requires comment context' };
    }

    const customFallback = (config.fallback_message || '')
      .replace(/\{\{ai_response\}\}/g, ctx.ai_response || '')
      .trim();
    const defaultFallback = effectiveLinkUrl
      ? `${openingMessage}\n\n${effectiveLinkUrl}`
      : openingMessage;
    const privateReplyMessage = customFallback || defaultFallback;

    const privateReplyResult = await executePrivateReply(
      { message: privateReplyMessage },
      ctx,
      accessToken,
      pageId,
    );

    if (!privateReplyResult.success) {
      return {
        success: false,
        error: privateReplyResult.error || 'DM failed and private reply fallback failed',
      };
    }

    return privateReplyResult;
  }

  // DM succeeded — send optional CTA follow-up
  if (effectiveLinkUrl) {
    const linkMessage = effectiveLinkMessage
      ? `${effectiveLinkMessage}\n\n${effectiveLinkUrl}`
      : effectiveLinkUrl;

    if (effectiveCtaMode === 'text') {
      await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: linkMessage },
          access_token: accessToken,
        }),
      });
    } else {
      const linkResp = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'button',
                text: effectiveLinkMessage || "Here's your link!",
                buttons: [{ type: 'web_url', url: effectiveLinkUrl, title: effectiveButtonText }],
              },
            },
          },
          access_token: accessToken,
        }),
      });

      const linkResult = await linkResp.json();
      if ((!linkResp.ok || linkResult.error) && buttonFallbackToText) {
        await fetch(sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text: linkMessage },
            access_token: accessToken,
          }),
        });
      }
    }
  }

  return { success: true, dmSent: true, output: { channel: 'dm', messageId: openingResult.message_id } };
}

async function executePrivateReply(
  config: any,
  ctx: TriggerContext & { ai_response?: string },
  accessToken: string,
  pageId: string,
): Promise<{ success: boolean; output?: any; error?: string; dmSent?: boolean }> {
  if (!ctx.comment_id) {
    return { success: false, error: 'Private Reply requires comment context' };
  }

  const useAiResponse = config.use_ai_response === true;
  const aiGeneratedMessage = String(ctx.ai_response || '').trim();
  const fallbackMessage = (config.message || '')
    .replace(/\{\{ai_response\}\}/g, ctx.ai_response || '')
    .trim();
  const message = useAiResponse ? (aiGeneratedMessage || fallbackMessage) : fallbackMessage;
  if (!message) {
    return {
      success: false,
      error: useAiResponse
        ? 'AI response is empty and no fallback private reply message is configured'
        : 'Private Reply message cannot be empty',
    };
  }

  const sendUrl = `${META_GRAPH_URL}/${pageId}/messages`;
  const response = await fetch(sendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { comment_id: ctx.comment_id },
      message: { text: message },
      access_token: accessToken,
    }),
  });

  const result = await response.json();
  if (!response.ok || result.error) {
    return { success: false, error: result.error?.message || 'Private reply failed' };
  }

  return {
    success: true,
    dmSent: true,
    output: { channel: 'private_reply', messageId: result.message_id },
  };
}

function executeCondition(
  config: any,
  ctx: TriggerContext,
): { success: boolean; output: { conditionResult: boolean } } {
  let conditionResult = false;
  const text = (ctx.comment_text || ctx.message_text || '').toLowerCase();

  switch (config.condition_type) {
    case 'keyword_match': {
      const keywords: string[] = config.keywords || [];
      if (config.operator === 'contains') {
        conditionResult = keywords.some(k => text.includes(k.toLowerCase()));
      } else if (config.operator === 'not_contains') {
        conditionResult = !keywords.some(k => text.includes(k.toLowerCase()));
      } else if (config.operator === 'equals') {
        conditionResult = keywords.some(k => text === k.toLowerCase());
      }
      break;
    }
    case 'follower_count':
    case 'comment_count':
      // These would need API calls — placeholder
      conditionResult = true;
      break;
  }

  return { success: true, output: { conditionResult } };
}

async function executeHttpRequest(
  config: any,
): Promise<{ success: boolean; output?: any; error?: string }> {
  try {
    const options: RequestInit = {
      method: config.method || 'GET',
      headers: config.headers || {},
    };

    if (config.body && config.method !== 'GET') {
      options.body = config.body;
      (options.headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    const response = await fetch(config.url, options);
    const data = await response.text();

    return {
      success: response.ok,
      output: { status: response.status, body: data.substring(0, 1000) },
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function executeAiResponse(
  supabase: any,
  config: any,
  ctx: TriggerContext,
  workspaceId: string,
): Promise<{ success: boolean; output?: any; error?: string }> {
  const prompt = buildAutomationAiPrompt(config, ctx);

  try {
    const useGlobal = config.use_global_settings !== false;
    const aiConfig = await resolveAIConfig({
      supabase,
      workspaceId,
      modelOverride: config.model,
      maxTokensOverride: config.max_tokens,
      useGlobalSettings: useGlobal,
    });

    // Import and initialize Gemini
    const { GoogleGenerativeAI } = await import("npm:@google/generative-ai");
    const genAI = new GoogleGenerativeAI(aiConfig.apiKey);
    const model = genAI.getGenerativeModel({
      model: aiConfig.modelName,
      generationConfig: { temperature: aiConfig.temperature, maxOutputTokens: aiConfig.maxTokens },
    });

    console.log(`[GRAPH] AI response: model=${aiConfig.modelName}, prompt="${prompt.substring(0, 100)}..."`);

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    console.log(`[GRAPH] AI response generated: "${responseText.substring(0, 100)}..."`);

    const includeCta = config.include_cta === true;
    const ctaMode = config.cta_mode === 'text' ? 'text' : 'button';
    const ctaButtonText = String(config.cta_button_text || '').trim();
    const ctaLinkUrl = String(config.cta_link_url || '').trim();
    const ctaLinkMessage = String(config.cta_link_message || '').trim();

    return {
      success: true,
      output: {
        response: responseText,
        model: aiConfig.modelName,
        cta_mode: includeCta ? ctaMode : undefined,
        cta_button_text: includeCta ? ctaButtonText : undefined,
        cta_link_url: includeCta ? ctaLinkUrl : undefined,
        cta_link_message: includeCta ? ctaLinkMessage : undefined,
      },
    };
  } catch (err) {
    console.error('[GRAPH] AI response error:', err);
    return { success: false, error: toUserFriendlyError(err) };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function getDelayMs(value: number, unit: string): number {
  switch (unit) {
    case 'seconds': return value * 1000;
    case 'minutes': return value * 60 * 1000;
    case 'hours': return value * 60 * 60 * 1000;
    case 'days': return value * 24 * 60 * 60 * 1000;
    default: return value * 60 * 1000;
  }
}
