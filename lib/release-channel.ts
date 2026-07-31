export type AppReleaseChannel = "production_full" | "review_phase_1"

const REVIEW_PHASE_1_BLOCKED_DASHBOARD_PATHS = [
  "/dashboard/messages",
  "/dashboard/comments",
  "/dashboard/posts",
  "/dashboard/analytics",
  "/dashboard/automation",
] as const

export function getAppReleaseChannel(): AppReleaseChannel {
  const raw = String(
    process.env.APP_RELEASE_CHANNEL ||
    process.env.NEXT_PUBLIC_APP_RELEASE_CHANNEL ||
    "production_full",
  ).trim()

  return raw === "review_phase_1" ? "review_phase_1" : "production_full"
}

export function isReviewPhase1Release(): boolean {
  return getAppReleaseChannel() === "review_phase_1"
}

export function isDashboardPathBlockedInCurrentRelease(pathname: string): boolean {
  if (!isReviewPhase1Release()) return false

  return REVIEW_PHASE_1_BLOCKED_DASHBOARD_PATHS.some((blockedPath) => {
    return pathname === blockedPath || pathname.startsWith(`${blockedPath}/`)
  })
}

export function isDashboardPathAvailableInCurrentRelease(pathname: string): boolean {
  return !isDashboardPathBlockedInCurrentRelease(pathname)
}
