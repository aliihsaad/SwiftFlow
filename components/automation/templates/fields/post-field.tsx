"use client"

import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { PostSelector } from '@/components/automation/post-selector'
import type { InstagramMedia } from '@/types/automation'

export function PostField({
  socialAccountId,
  value,
  onChange,
  label,
  required,
}: {
  socialAccountId: string
  value: string
  onChange: (postId: string) => void
  label: string
  required?: boolean
}) {
  const [selectedPost, setSelectedPost] = useState<InstagramMedia | null>(null)

  useEffect(() => {
    if (!value) setSelectedPost(null)
  }, [value])

  const handlePostSelect = (post: InstagramMedia) => {
    setSelectedPost(post)
    onChange(post.id)
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-white/80">
        {label}
        {required && <span className="ml-1 text-rose-300">*</span>}
      </Label>
      {socialAccountId ? (
        <PostSelector
          selectedAccountId={socialAccountId}
          selectedPost={selectedPost}
          onSelect={handlePostSelect}
        />
      ) : (
        <p className="text-xs text-amber-300">Pick an account first to choose a post.</p>
      )}
    </div>
  )
}
