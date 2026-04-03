import { LandingPage } from "@/components/landing/landing-page"
import { isReviewPhase1Release } from "@/lib/release-channel"

export const metadata = {
  title: isReviewPhase1Release()
    ? "SwiftFlow — Meta Review Build"
    : "SwiftFlow — Your Social Media, on Autopilot",
  description: isReviewPhase1Release()
    ? "Connect Meta accounts, create AI-assisted posts, publish immediately, and schedule content from one review-safe dashboard."
    : "Generate AI content, schedule posts, manage DMs and track analytics — all from one sleek dashboard. Built for creators and brands.",
}

export default function Home() {
  return <LandingPage reviewPhase1Release={isReviewPhase1Release()} />
}
