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
        <div className="container max-w-4xl py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Brand Profile</h1>
                <p className="text-muted-foreground mt-2">
                    Manage your brand identity and connected social accounts
                </p>
            </div>

            <Tabs defaultValue="details" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="details">Brand Details</TabsTrigger>
                    <TabsTrigger value="social">Connected Accounts</TabsTrigger>
                </TabsList>

                <TabsContent value="details">
                    <BrandProfileForm workspaceId={activeWorkspace.id} />
                </TabsContent>

                <TabsContent value="social">
                    <ConnectedAccounts />
                </TabsContent>
            </Tabs>
        </div>
    )
}
