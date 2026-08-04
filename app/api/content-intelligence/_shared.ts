import { createAdminClient } from "@/utils/supabase/admin"
import { buildContentIntelligenceSignals } from "@/lib/content-intelligence/internal-signals"
import type { ContentIntelligenceSignals } from "@/lib/content-intelligence/types"

type Row = Record<string, unknown>

export async function loadContentIntelligenceSignals(workspaceId: string): Promise<ContentIntelligenceSignals> {
  const admin = createAdminClient()

  const [{ data: brandProfile }, { data: socialAccounts }, { data: posts }] = await Promise.all([
    admin.from("workspace_brand_profiles").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    admin.from("social_accounts").select("id, platform, metadata").eq("workspace_id", workspaceId).eq("platform", "instagram"),
    admin.from("posts").select("id").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100),
  ])

  const postIds = (posts || []).map((post: { id: string }) => post.id)
  let publishedPosts: Row[] = []

  if (postIds.length > 0) {
    const { data } = await admin.from("published_posts").select("*").in("post_id", postIds).eq("platform", "instagram").limit(100)
    publishedPosts = (data || []) as Row[]
  }

  const accountIds = (socialAccounts || []).map((account: { id: string }) => account.id)
  if (accountIds.length > 0) {
    const { data } = await admin.from("published_posts").select("*").in("social_account_id", accountIds).eq("platform", "instagram").limit(100)
    const map = new Map<string, Row>()
    for (const row of [...publishedPosts, ...((data || []) as Row[])]) {
      if (typeof row.id === "string") map.set(row.id, row)
    }
    publishedPosts = Array.from(map.values())
  }

  const publishedPostIds = publishedPosts.map((post) => post.id).filter((id): id is string => typeof id === "string")
  let postAnalytics: Row[] = []

  if (publishedPostIds.length > 0) {
    const { data } = await admin.from("post_analytics").select("*").in("published_post_id", publishedPostIds)
    postAnalytics = (data || []) as Row[]
  }

  return buildContentIntelligenceSignals({
    brandProfile: (brandProfile || null) as Row | null,
    publishedPosts,
    postAnalytics,
    socialAccounts: (socialAccounts || []) as Row[],
  })
}
