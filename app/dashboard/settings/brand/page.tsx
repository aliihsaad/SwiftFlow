import { getActiveWorkspace } from "@/lib/workspace-utils"
import { BrandProfileForm } from "@/components/settings/brand-profile-form"
import { redirect } from "next/navigation"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConnectedAccounts } from "@/components/settings/connected-accounts"

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
                    Manage your brand identity and connected social accounts
                </p>
            </div>

            <Tabs defaultValue="details" className="space-y-6">
                <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl border border-white/10 bg-[#1b1d28] p-1 sm:inline-flex sm:w-fit sm:grid-cols-none">
                    <TabsTrigger value="details" className="min-w-0 rounded-lg px-2 py-2 text-xs font-medium text-white/60 data-[state=active]:bg-white/10 data-[state=active]:text-white sm:px-4 sm:py-2.5 sm:text-sm">Brand Details</TabsTrigger>
                    <TabsTrigger value="social" className="min-w-0 rounded-lg px-2 py-2 text-xs font-medium text-white/60 data-[state=active]:bg-white/10 data-[state=active]:text-white sm:px-4 sm:py-2.5 sm:text-sm">Connected Accounts</TabsTrigger>
                </TabsList>

                <TabsContent value="details">
                    <BrandProfileForm workspaceId={activeWorkspace.id} />
                </TabsContent>

                <TabsContent value="social">
                    <ConnectedAccounts workspaceId={activeWorkspace.id} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
