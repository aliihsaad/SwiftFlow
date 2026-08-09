import { getActiveWorkspace } from "@/lib/workspace-utils"
import { BrandProfileForm } from "@/components/settings/brand-profile-form"
import { redirect } from "next/navigation"

export default async function BrandSettingsPage() {
    const activeWorkspace = await getActiveWorkspace()

    if (!activeWorkspace) {
        redirect('/dashboard')
    }

    return (
        <div className="container max-w-5xl py-8">
            <div className="mb-8 space-y-2">
                <div className="inline-flex items-center rounded-full border border-cyan-300/15 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
                    Brand Profile
                </div>
                <h1 className="text-3xl font-bold text-white/90">Brand Profile</h1>
                <p className="mt-2 text-white/55">
                    Give AI replies and automations the business context they need.
                </p>
            </div>

            <BrandProfileForm workspaceId={activeWorkspace.id} />
        </div>
    )
}
