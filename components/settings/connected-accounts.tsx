"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Facebook, Instagram } from "lucide-react"

export function ConnectedAccounts() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Connected Accounts</CardTitle>
                <CardDescription>
                    Connect your social media accounts to this workspace to start posting.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                            <Facebook className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <h4 className="font-semibold">Facebook</h4>
                            <p className="text-sm text-muted-foreground">Not connected</p>
                        </div>
                    </div>
                    <Button variant="outline">Connect Page</Button>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-full">
                            <Instagram className="h-6 w-6 text-pink-600" />
                        </div>
                        <div>
                            <h4 className="font-semibold">Instagram</h4>
                            <p className="text-sm text-muted-foreground">Not connected</p>
                        </div>
                    </div>
                    <Button variant="outline">Connect Business</Button>
                </div>
            </CardContent>
        </Card>
    )
}
