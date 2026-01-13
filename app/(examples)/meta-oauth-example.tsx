/**
 * Example: How to use the Meta OAuth button in your settings page
 * 
 * This is a reference implementation showing how to integrate
 * the ConnectMetaButton component into your settings page.
 */

import { ConnectMetaButton } from "@/components/connect-meta-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function ExampleSettingsPage() {
    return (
        <div className="container mx-auto p-6">
            <h1 className="text-3xl font-bold mb-6">Settings</h1>

            <Card>
                <CardHeader>
                    <CardTitle>Social Media Connections</CardTitle>
                    <CardDescription>
                        Connect your Facebook account to manage Pages and Instagram Business accounts
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Meta/Facebook Connection */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium">Facebook Pages</h3>
                        <p className="text-sm text-muted-foreground">
                            Connect your Facebook account to access your Pages and linked Instagram Business accounts.
                        </p>
                        <ConnectMetaButton />
                    </div>

                    {/* Success/Error Messages */}
                    {/* You can read from URL params to show status */}
                    {/* Example: ?success=meta_connected or ?error=user_denied */}
                </CardContent>
            </Card>
        </div>
    )
}
