/**
 * Migration script: Convert existing wizard-based automations to graph format.
 *
 * Usage: npx tsx scripts/migrate-automations-to-graph.ts
 *
 * This script:
 * 1. Fetches all automations with editor_version = 'wizard' (or NULL)
 * 2. Converts their trigger/reply/dm configs into graph nodes + edges
 * 3. Stores the workflow_graph and sets editor_version = 'canvas'
 */

import { createClient } from '@supabase/supabase-js'
import type { WorkflowGraph, WorkflowNode, WorkflowEdge } from '../types/automation-graph'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

interface LegacyAutomation {
  id: string
  social_account_id: string
  platform_post_id: string
  post_thumbnail_url?: string
  post_caption?: string
  trigger_config: {
    trigger_type: 'any_comment' | 'keywords'
    keywords: string[]
  }
  comment_reply_config: {
    enabled: boolean
    messages: string[]
  }
  dm_config: {
    opening_message: string
    button_text: string
    link_url: string
    link_message?: string
  }
  editor_version?: string
}

function convertToGraph(auto: LegacyAutomation): WorkflowGraph {
  const nodes: WorkflowNode[] = []
  const edges: WorkflowEdge[] = []

  // 1. Create trigger node
  const triggerId = 'trigger-1'
  nodes.push({
    id: triggerId,
    type: 'trigger',
    position: { x: 250, y: 50 },
    data: {
      type: 'trigger_new_comment',
      label: 'New Comment',
      config: {
        trigger_type: auto.trigger_config.trigger_type === 'any_comment' ? 'any' : 'keywords',
        keywords: auto.trigger_config.keywords || [],
        post_id: auto.platform_post_id,
        post_thumbnail_url: auto.post_thumbnail_url,
        post_caption: auto.post_caption,
        social_account_id: auto.social_account_id,
      },
    },
  })

  let lastNodeId = triggerId
  let yPos = 200

  // 2. Comment reply node (if enabled)
  if (auto.comment_reply_config?.enabled && auto.comment_reply_config.messages.length > 0) {
    const replyId = 'action-reply-1'
    nodes.push({
      id: replyId,
      type: 'action',
      position: { x: 250, y: yPos },
      data: {
        type: 'action_reply_comment',
        label: 'Reply to Comment',
        config: {
          messages: auto.comment_reply_config.messages,
        },
      },
    })
    edges.push({
      id: `${lastNodeId}-${replyId}`,
      source: lastNodeId,
      target: replyId,
    })
    lastNodeId = replyId
    yPos += 150
  }

  // 3. Send DM node (if configured)
  if (auto.dm_config?.opening_message) {
    const dmId = 'action-dm-1'
    nodes.push({
      id: dmId,
      type: 'action',
      position: { x: 250, y: yPos },
      data: {
        type: 'action_send_dm',
        label: 'Send DM',
        config: {
          opening_message: auto.dm_config.opening_message,
          button_text: auto.dm_config.button_text || '',
          link_url: auto.dm_config.link_url || '',
          link_message: auto.dm_config.link_message,
        },
      },
    })
    edges.push({
      id: `${lastNodeId}-${dmId}`,
      source: lastNodeId,
      target: dmId,
    })
  }

  return { nodes, edges }
}

async function main() {
  console.log('Fetching automations to migrate...')

  const { data: automations, error } = await supabase
    .from('automations')
    .select('*')
    .or('editor_version.is.null,editor_version.eq.wizard')

  if (error) {
    console.error('Failed to fetch automations:', error)
    process.exit(1)
  }

  if (!automations || automations.length === 0) {
    console.log('No automations to migrate.')
    return
  }

  console.log(`Found ${automations.length} automation(s) to migrate.`)

  let migrated = 0
  let failed = 0

  for (const auto of automations as LegacyAutomation[]) {
    try {
      const graph = convertToGraph(auto)

      const { error: updateError } = await supabase
        .from('automations')
        .update({
          workflow_graph: graph,
          editor_version: 'canvas',
          updated_at: new Date().toISOString(),
        })
        .eq('id', auto.id)

      if (updateError) {
        console.error(`Failed to migrate automation ${auto.id}:`, updateError)
        failed++
      } else {
        console.log(`Migrated automation ${auto.id} (${graph.nodes.length} nodes, ${graph.edges.length} edges)`)
        migrated++
      }
    } catch (err) {
      console.error(`Error migrating automation ${auto.id}:`, err)
      failed++
    }
  }

  console.log(`\nMigration complete: ${migrated} migrated, ${failed} failed.`)
}

main()
