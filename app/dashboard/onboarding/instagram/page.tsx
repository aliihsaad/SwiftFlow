import { redirect } from "next/navigation"
import { InstagramQuickStart } from "@/components/onboarding/instagram-quick-start"
import { getActiveWorkspace } from "@/lib/workspace-utils"

export default async function InstagramOnboardingPage() {
  const workspace = await getActiveWorkspace()
  if (!workspace) redirect("/dashboard")

  return (
    <InstagramQuickStart
      workspaceId={workspace.id}
      workspaceName={workspace.name}
    />
  )
}
