// @ts-nocheck - Deno runtime helper

export const META_GRAPH_API_VERSION = "v21.0"
export const META_GRAPH_API_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`

const META_GRAPH_NODE_ID_RE = /^[0-9_]{3,128}$/

export function isSafeMetaGraphNodeId(value: unknown): value is string {
  return typeof value === 'string' && META_GRAPH_NODE_ID_RE.test(value.trim())
}
