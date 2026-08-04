export const META_GRAPH_API_VERSION = "v25.0"
export const INSTAGRAM_GRAPH_API_BASE_URL = `https://graph.instagram.com/${META_GRAPH_API_VERSION}`
// Compatibility alias for callers that use the generic name.
export const META_GRAPH_API_BASE_URL = INSTAGRAM_GRAPH_API_BASE_URL

export type MetaConnectionMethod = "instagram_login"

export function getMetaGraphApiBaseUrl(_connectionMethod?: unknown): string {
  return INSTAGRAM_GRAPH_API_BASE_URL
}
