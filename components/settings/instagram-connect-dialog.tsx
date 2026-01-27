"use client"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { CheckCircle2, Facebook, Instagram } from "lucide-react"
import { useState } from "react"
import { redirectToMetaOAuth } from "@/utils/meta-oauth"

interface InstagramConnectDialogProps {
    workspaceId: string;
    trigger?: React.ReactNode;
}

export function InstagramConnectDialog({ workspaceId, trigger }: InstagramConnectDialogProps) {
    const [isOpen, setIsOpen] = useState(false);

    const handleConnect = () => {
        setIsOpen(false);
        redirectToMetaOAuth(workspaceId);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" className="gap-2">
                        <Instagram className="h-4 w-4" />
                        Connect Instagram
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <div className="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-lg">
                            <Instagram className="h-6 w-6 text-pink-600" />
                        </div>
                        Connect Instagram Business
                    </DialogTitle>
                    <DialogDescription className="pt-2">
                        To connect Instagram, your account must meet Meta's API requirements.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                    <div className="flex gap-4">
                        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-600 font-bold text-sm">
                            1
                        </div>
                        <div className="space-y-1">
                            <h4 className="font-medium text-sm">Switch to Professional Account</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Your Instagram account must be a <strong>Business</strong> or <strong>Creator</strong> account. Public Personal accounts are not supported by Meta's API.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm">
                            2
                        </div>
                        <div className="space-y-1">
                            <h4 className="font-medium text-sm">Link to a Facebook Page</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Go to your Instagram Profile &gt; Edit Profile &gt; Page and ensure a Facebook Page is connected.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 font-bold text-sm">
                            3
                        </div>
                        <div className="space-y-1">
                            <h4 className="font-medium text-sm">Connect via Facebook</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Log in with the Facebook account that manages that Page.
                            </p>
                        </div>
                    </div>
                </div>

                <DialogFooter className="sm:justify-start">
                    <Button
                        onClick={handleConnect}
                        className="w-full bg-[#1877F2] hover:bg-[#166fe5] text-white gap-2"
                    >
                        <Facebook className="h-4 w-4" />
                        Connect via Facebook
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
