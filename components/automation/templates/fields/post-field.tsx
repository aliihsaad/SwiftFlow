"use client"

import useSWR from 'swr'
import { Check, Image as ImageIcon, Video, LayoutGrid } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { InstagramMedia } from '@/types/automation'

const fetcher = async (url: string): Promise<{ media: InstagramMedia[] }> => {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Failed to load posts')
  return data
}

function getMediaIcon(mediaType: string) {
  switch (mediaType) {
    case 'VIDEO':
      return Video
    case 'CAROUSEL_ALBUM':
      return LayoutGrid
    default:
      return ImageIcon
  }
}

export function PostField({
  socialAccountId,
  platform,
  value,
  onChange,
  label,
  required,
}: {
  socialAccountId: string
  platform: 'instagram' | 'facebook'
  value: string
  onChange: (postId: string) => void
  label: string
  required?: boolean
}) {
  const { data, isLoading } = useSWR<{ media: InstagramMedia[] }>(
    socialAccountId ? `/api/automations/media?account_id=${socialAccountId}` : null,
    fetcher,
  )
  const media = data?.media || []
  const postLabel = platform === 'facebook' ? 'page post' : 'post'

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-white/80">
        {label}
        {required && <span className="ml-1 text-rose-300">*</span>}
      </Label>
      {!socialAccountId ? (
        <p className="text-xs text-amber-300">Pick an account first to choose a {postLabel}.</p>
      ) : isLoading ? (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      ) : media.length === 0 ? (
        <p className="text-xs text-white/45">No {postLabel}s found for this account.</p>
      ) : (
        <div className="grid max-h-[280px] grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
          {media.map((post) => {
            const isSelected = value === post.id
            const MediaIcon = getMediaIcon(post.media_type)
            return (
              <button
                key={post.id}
                type="button"
                onClick={() => onChange(post.id)}
                className={cn(
                  'relative aspect-square overflow-hidden rounded-md ring-2 ring-transparent transition hover:ring-cyan-300/40',
                  isSelected && 'ring-cyan-300/80',
                )}
              >
                {post.thumbnail_url || post.media_url ? (
                  <img
                    src={post.thumbnail_url || post.media_url || ''}
                    alt={post.caption || `${postLabel}`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
                    <ImageIcon className="h-5 w-5 text-white/40" />
                  </div>
                )}
                {post.media_type !== 'IMAGE' && (
                  <div className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5">
                    <MediaIcon className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
                {isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-cyan-400/25">
                    <div className="rounded-full bg-cyan-400 p-0.5 text-black">
                      <Check className="h-3 w-3" />
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
