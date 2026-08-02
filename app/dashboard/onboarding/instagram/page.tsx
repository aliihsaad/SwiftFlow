import { Suspense } from "react"
import { redirect } from "next/navigation"
import { InstagramQuickStart } from "@/components/onboarding/instagram-quick-start"
import { getActiveWorkspace } from "@/lib/workspace-utils"

function SetupLoading() {
    return (
        <div className="mx-auto w-full max-w-[1480px] space-y-5 pb-8">
            <div className="sf-panel h-64 animate-pulse bg-white/[0.025]" />
            <div className="grid gap-5 lg:grid-cols-[minmax(250px,0.72fr)_minmax(0,1.6fr)]">
                <div className="sf-panel h-80 animate-pulse bg-white/[0.025]" />
                <div className="sf-panel h-[470px] animate-pulse bg-white/[0.025]" />
            </div>
        </div>
    )
}

export default async function InstagramOnboardingPage() {
    const workspace = await getActiveWorkspace()
    if (!workspace) redirect("/dashboard/onboarding")

    return (
        <Suspense fallback={<SetupLoading />}>
            <InstagramQuickStart workspaceId={workspace.id} workspaceName={workspace.name} />
        </Suspense>
    )
}
