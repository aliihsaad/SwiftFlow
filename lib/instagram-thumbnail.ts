/** A Reel's media_url is a video; only its thumbnail is an image. */
export function getInstagramThumbnailUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const media = value as Record<string, unknown>
  const candidate = media.thumbnail_url || (media.media_type !== 'VIDEO' ? media.media_url : null)
  if (typeof candidate !== 'string') return null
  try {
    const url = new URL(candidate)
    const isMetaCdn = ['cdninstagram.com', 'fbcdn.net'].some(domain =>
      url.hostname === domain || url.hostname.endsWith(`.${domain}`))
    return url.protocol === 'https:' && !url.username && !url.password && isMetaCdn ? url.toString() : null
  } catch { return null }
}
