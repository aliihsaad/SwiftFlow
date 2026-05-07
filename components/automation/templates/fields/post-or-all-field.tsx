"use client"

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { PostSelector } from '@/components/automation/post-selector'
import type { InstagramMedia } from '@/types/automation'

export function PostOrAllField({
  socialAccountId,
  selection,
  onChange,
  label,
  required,
}: {
  socialAccountId: string
  selection: string
  onChange: (next: { selection: 'all' | string; postId: string }) => void
  label: string
  required?: boolean
}) {
  const isAll = selection === 'all' || !selection
  const [selectedPost, setSelectedPost] = useState<InstagramMedia | null>(null)

  const handlePostSelect = (post: InstagramMedia) => {
    setSelectedPost(post)
    onChange({ selection: post.id, postId: post.id })
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-white/80">
        {label}
        {required && <span className="ml-1 text-rose-300">*</span>}
      </Label>
      <div className="flex items-center gap-3">
        <Switch
          checked={isAll}
          onCheckedChange={(checked) =>
            onChange({ selection: checked ? 'all' : '', postId: '' })
          }
        />
        <span className="text-sm text-white/75">Apply to all posts</span>
      </div>
      {!isAll && socialAccountId && (
        <PostSelector
          selectedAccountId={socialAccountId}
          selectedPost={selectedPost}
          onSelect={handlePostSelect}
        />
      )}
      {!isAll && !socialAccountId && (
        <p className="text-xs text-amber-300">Pick an account first to choose a post.</p>
      )}
    </div>
  )
}
