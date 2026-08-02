export const META_GRAPH_API_VERSION = "v25.0"
export const META_GRAPH_API_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`
export const INSTAGRAM_GRAPH_API_BASE_URL = `https://graph.instagram.com/${META_GRAPH_API_VERSION}`
export const META_OAUTH_DIALOG_BASE_URL = `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth`

export type MetaConnectionMethod = "facebook_login" | "instagram_login"

export function getMetaGraphApiBaseUrl(
  connectionMethod?: unknown,
): string {
  return connectionMethod === "instagram_login"
    ? INSTAGRAM_GRAPH_API_BASE_URL
    : META_GRAPH_API_BASE_URL
}
