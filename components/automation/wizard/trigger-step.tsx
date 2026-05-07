"use client"

import { useEffect, useMemo, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import useSWR from "swr"
import { Check, Image as ImageIcon, LayoutGrid, Video } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { InstagramMedia } from "@/types/automation"
import type {
  AutomationWizardPlatform,
  AutomationWizardState,
  WizardFilterConfig,
  WizardTriggerType,
} from "@/lib/automation-wizard/types"

interface SocialAccountOption {
  id: string
  platform: string
  account_name: string
  account_id: string
}

const TRIGGER_OPTIONS: Array<{
  type: WizardTriggerType
  label: string
  description: string
}> = [
  {
    type: "trigger_new_comment",
    label: "New comment",
    description: "Start when someone comments on a selected post.",
  },
  {
    type: "trigger_new_message",
    label: "New message",
    description: "Start when someone sends the account a message.",
  },
  {
    type: "trigger_new_follower",
    label: "New follower",
    description: "Start when a person follows the account.",
  },
  {
    type: "trigger_cron",
    label: "Schedule",
    description: "Start from a recurring schedule.",
  },
  {
    type: "trigger_story_mention",
    label: "Story mention",
    description: "Start when the account is mentioned in a story.",
  },
  {
    type: "trigger_story_reply",
    label: "Story reply",
    description: "Start when someone replies to a story.",
  },
]

const PLATFORM_OPTIONS: Array<{ platform: AutomationWizardPlatform; label: string }> = [
  { platform: "instagram", label: "Instagram" },
  { platform: "facebook", label: "Facebook" },
]

const FILTER_OPTIONS: Array<{ type: WizardFilterConfig["triggerType"]; label: string }> = [
  { type: "any", label: "Any" },
  { type: "keywords", label: "Keywords" },
]

const TRIGGERS_WITH_POST_PICKER: WizardTriggerType[] = ["trigger_new_comment"]
const TRIGGERS_WITH_KEYWORDS: WizardTriggerType[] = ["trigger_new_comment", "trigger_new_message"]
const TRIGGERS_INSTAGRAM_ONLY: WizardTriggerType[] = ["trigger_story_mention", "trigger_story_reply"]

const accountsFetcher = async (url: string): Promise<{ accounts: SocialAccountOption[] }> => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load accounts")
  }
  return data
}

const mediaFetcher = async (url: string): Promise<{ media: InstagramMedia[] }> => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load posts")
  }
  return data
}

function parseKeywords(value: string): string[] {
  return value
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
}

function keywordsInputValue(keywords: string[]): string {
  return keywords.join(", ")
}

function getMediaIconType(mediaType: string) {
  if (mediaType === "VIDEO") return Video
  if (mediaType === "CAROUSEL_ALBUM") return LayoutGrid
  return ImageIcon
}

export function TriggerStep({
  state,
  setState,
}: {
  state: AutomationWizardState
  setState: Dispatch<SetStateAction<AutomationWizardState>>
}) {
  const externalKeywords = keywordsInputValue(state.filters.keywords)
  const [keywordDraft, setKeywordDraft] = useState(() => ({
    raw: externalKeywords,
    source: externalKeywords,
  }))
  const rawKeywords =
    keywordDraft.source === externalKeywords ? keywordDraft.raw : externalKeywords

  const platform = state.account.platform
  const platformLocked = TRIGGERS_INSTAGRAM_ONLY.includes(state.triggerType)
  const showPostPicker = TRIGGERS_WITH_POST_PICKER.includes(state.triggerType)
  const showKeywordFilter = TRIGGERS_WITH_KEYWORDS.includes(state.triggerType)

  const { data: accountsData, isLoading: accountsLoading } = useSWR(
    `/api/automations/social-accounts?platform=${platform}`,
    accountsFetcher,
  )
  const accounts = useMemo(() => accountsData?.accounts || [], [accountsData])

  const { data: mediaData, isLoading: mediaLoading } = useSWR(
    showPostPicker && state.account.socialAccountId
      ? `/api/automations/media?account_id=${state.account.socialAccountId}`
      : null,
    mediaFetcher,
  )
  const posts = mediaData?.media || []

  useEffect(() => {
    if (platformLocked && platform !== "instagram") {
      setState((current) => ({
        ...current,
        account: { ...current.account, platform: "instagram" },
      }))
    }
  }, [platformLocked, platform, setState])

  useEffect(() => {
    if (state.account.socialAccountId || accounts.length === 0) {
      return
    }
    const first = accounts[0]
    setState((current) => ({
      ...current,
      account: {
        ...current.account,
        socialAccountId: first.id,
        accountName: first.account_name,
      },
    }))
  }, [accounts, state.account.socialAccountId, setState])

  const commitKeywords = (value: string) => {
    const keywords = parseKeywords(value)
    const nextValue = keywordsInputValue(keywords)
    setKeywordDraft({ raw: nextValue, source: nextValue })
    setState((current) => ({
      ...current,
      filters: {
        ...current.filters,
        keywords,
      },
    }))
  }

  const handlePlatformChange = (nextPlatform: AutomationWizardPlatform) => {
    setState((current) => ({
      ...current,
      account: {
        ...current.account,
        platform: nextPlatform,
        socialAccountId: "",
        accountName: undefined,
      },
      target: {},
    }))
  }

  const handleAccountChange = (account: SocialAccountOption) => {
    setState((current) => ({
      ...current,
      account: {
        ...current.account,
        socialAccountId: account.id,
        accountName: account.account_name,
      },
      target: {},
    }))
  }

  const handlePostSelect = (post: InstagramMedia) => {
    setState((current) => ({
      ...current,
      target: {
        postId: post.id,
        postThumbnailUrl: post.thumbnail_url || post.media_url || "",
        postCaption: post.caption || "",
      },
    }))
  }

  return (
    <div className="mt-5 space-y-6">
      <div className="space-y-3">
        <Label className="text-sm font-semibold text-white/80">Trigger</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {TRIGGER_OPTIONS.map((option) => {
            const isSelected = state.triggerType === option.type

            return (
              <button
                key={option.type}
                type="button"
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    triggerType: option.type,
                    target: {},
                  }))
                }
                className={cn(
                  "rounded-lg border p-3 text-left transition hover:border-white/25 hover:bg-white/[0.06]",
                  isSelected
                    ? "border-violet-400/50 bg-violet-500/15"
                    : "border-white/10 bg-white/[0.03]",
                )}
              >
                <div className="text-sm font-semibold text-white/90">{option.label}</div>
                <div className="mt-1 text-xs leading-relaxed text-white/45">{option.description}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-semibold text-white/80">Platform</Label>
        <div className="grid grid-cols-2 gap-2">
          {PLATFORM_OPTIONS.map((option) => {
            const disabled = platformLocked && option.platform !== "instagram"
            return (
              <Button
                key={option.platform}
                type="button"
                variant={platform === option.platform ? "default" : "outline"}
                onClick={() => handlePlatformChange(option.platform)}
                disabled={disabled}
                className="w-full"
              >
                {option.label}
              </Button>
            )
          })}
        </div>
        {platformLocked ? (
          <p className="text-xs text-white/45">Story triggers are Instagram-only.</p>
        ) : null}
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-semibold text-white/80">
          {platform === "facebook" ? "Facebook page" : "Instagram account"}
        </Label>
        {accountsLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : accounts.length === 0 ? (
          <p className="text-xs text-white/45">
            No {platform === "facebook" ? "Facebook pages" : "Instagram accounts"} connected. Connect
            one in Settings before saving.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {accounts.map((account) => {
              const isSelected = state.account.socialAccountId === account.id
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => handleAccountChange(account)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border p-3 text-left transition hover:border-white/25 hover:bg-white/[0.06]",
                    isSelected
                      ? "border-violet-400/50 bg-violet-500/15"
                      : "border-white/10 bg-white/[0.03]",
                  )}
                >
                  <span className="truncate text-sm font-semibold text-white/90">
                    {account.account_name}
                  </span>
                  {isSelected ? <Check className="h-4 w-4 text-violet-300" /> : null}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {showPostPicker ? (
        <div className="space-y-3">
          <Label className="text-sm font-semibold text-white/80">Post</Label>
          {!state.account.socialAccountId ? (
            <p className="text-xs text-white/45">Pick an account first to load posts.</p>
          ) : mediaLoading ? (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="aspect-square rounded-md" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <p className="text-xs text-white/45">No posts found for this account.</p>
          ) : (
            <div className="grid max-h-[280px] grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
              {posts.map((post) => {
                const isSelected = state.target.postId === post.id
                const MediaIcon = getMediaIconType(post.media_type)
                const thumbnail = post.thumbnail_url || post.media_url

                return (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => handlePostSelect(post)}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-md ring-2 ring-transparent transition hover:ring-violet-400/50",
                      isSelected ? "ring-violet-400" : null,
                    )}
                  >
                    {thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbnail}
                        alt={post.caption || "Post"}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-white/[0.05]">
                        <ImageIcon className="h-5 w-5 text-white/40" />
                      </div>
                    )}

                    {post.media_type !== "IMAGE" ? (
                      <div className="absolute right-1 top-1 rounded bg-black/55 p-0.5">
                        <MediaIcon className="h-3 w-3 text-white" />
                      </div>
                    ) : null}

                    {isSelected ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-violet-500/30">
                        <span className="rounded-full bg-violet-400 p-0.5 text-[#080912]">
                          <Check className="h-3 w-3" />
                        </span>
                      </div>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
          {state.target.postId && state.target.postCaption ? (
            <div className="flex items-start gap-2 rounded-md border border-white/10 bg-white/[0.03] p-2">
              {state.target.postThumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.target.postThumbnailUrl}
                  alt="Selected post"
                  className="h-10 w-10 shrink-0 rounded object-cover"
                />
              ) : null}
              <p className="line-clamp-2 text-xs text-white/55">{state.target.postCaption}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {showKeywordFilter ? (
        <div className="space-y-3">
          <Label className="text-sm font-semibold text-white/80">Filter</Label>
          <div className="grid grid-cols-2 gap-2">
            {FILTER_OPTIONS.map((option) => (
              <Button
                key={option.type}
                type="button"
                variant={state.filters.triggerType === option.type ? "default" : "outline"}
                onClick={() => {
                  const nextKeywords =
                    option.type === "keywords" ? parseKeywords(rawKeywords) : []
                  const nextValue = keywordsInputValue(nextKeywords)
                  setKeywordDraft({ raw: nextValue, source: nextValue })
                  setState((current) => ({
                    ...current,
                    filters: {
                      ...current.filters,
                      triggerType: option.type,
                      keywords: nextKeywords,
                    },
                  }))
                }}
                className="w-full"
              >
                {option.label}
              </Button>
            ))}
          </div>

          {state.filters.triggerType === "keywords" ? (
            <div className="space-y-2">
              <Label htmlFor="wizard-trigger-keywords" className="text-xs text-white/55">
                Keywords (comma separated)
              </Label>
              <Input
                id="wizard-trigger-keywords"
                value={rawKeywords}
                onChange={(event) =>
                  setKeywordDraft({ raw: event.target.value, source: externalKeywords })
                }
                onBlur={(event) => commitKeywords(event.target.value)}
                placeholder="pricing, demo, support"
                className="bg-white/[0.04] text-white placeholder:text-white/30"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
