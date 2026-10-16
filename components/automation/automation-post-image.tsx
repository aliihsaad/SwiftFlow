"use client"

import { useState } from 'react'
import Image from 'next/image'
import useSWR from 'swr'
import { ImageOff } from 'lucide-react'
import { isMetaGraphNodeId, isUuid } from '@/lib/security/phase1-validation'

interface AutomationPostImageProps {
  accountId?: string
  postId?: string
  src?: string
  alt?: string
  sizes?: string
  className?: string
}

async function refreshThumbnail(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Post preview unavailable')
  const data = await response.json()
  if (typeof data.thumbnail_url !== 'string') throw new Error('Missing post preview')
  return data.thumbnail_url
}

export function AutomationPostImage(props: AutomationPostImageProps) {
  // A different selected post or saved URL starts a fresh recovery attempt.
  return <PostImage key={`${props.accountId}:${props.postId}:${props.src}`} {...props} />
}

function PostImage({ accountId, postId, src, alt = '', sizes = '56px', className = 'object-cover' }: AutomationPostImageProps) {
  const [refresh, setRefresh] = useState(!src)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const refreshUrl = isUuid(accountId) && isMetaGraphNodeId(postId)
    ? `/api/automations/post-thumbnail?account_id=${encodeURIComponent(accountId)}&post_id=${encodeURIComponent(postId)}` : null
  const { data: freshUrl, error } = useSWR(refresh ? refreshUrl : null, refreshThumbnail, {
    dedupingInterval: 60_000, revalidateOnMount: true, revalidateOnFocus: false, shouldRetryOnError: false,
  })
  const imageUrl = refresh ? freshUrl : src
  if (!imageUrl || failedUrl === imageUrl || error) {
    return <span className="grid h-full w-full place-items-center bg-white/[0.03]" role="img" aria-label="Post preview unavailable">
      <ImageOff className="h-4 w-4 text-white/35" aria-hidden="true" />
    </span>
  }
  return <Image src={imageUrl} alt={alt} fill unoptimized sizes={sizes} className={className}
    onError={() => { if (refresh) setFailedUrl(imageUrl); else setRefresh(true) }} />
}
