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
import { CheckCircle2, Instagram, Loader2, ShieldCheck, Webhook } from "lucide-react"
import { useState } from "react"

interface InstagramConnectDialogProps {
    workspaceId: string;
    trigger?: React.ReactNode;
    isConnecting?: boolean;
    onConnectStart?: () => void;
}

export function InstagramConnectDialog({ workspaceId, trigger, isConnecting = false, onConnectStart }: InstagramConnectDialogProps) {
    const [isOpen, setIsOpen] = useState(false);

    const handleConnect = () => {
        if (isConnecting) return;
        onConnectStart?.();
        setIsOpen(false);
        window.location.href = `/dashboard/onboarding/instagram?workspaceId=${encodeURIComponent(workspaceId)}`;
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" className="gap-2 border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white">
                        <Instagram className="h-4 w-4" />
                        Connect Instagram
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md border-white/10 bg-[#151620] text-white/85">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <div className="rounded-lg border border-rose-300/15 bg-rose-400/10 p-2">
                            <Instagram className="h-6 w-6 text-rose-300" />
                        </div>
                        Connect Instagram Business
                    </DialogTitle>
                    <DialogDescription className="pt-2 text-white/50">
                        Connect directly with Instagram. A linked Facebook Page is not required.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                    <div className="flex gap-4">
                        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full border border-rose-300/15 bg-rose-400/10 font-bold text-sm text-rose-300">
                            1
                        </div>
                        <div className="space-y-1">
                            <h4 className="text-sm font-medium text-white/85">Switch to Professional Account</h4>
                            <p className="text-xs leading-relaxed text-white/50">
                                Your Instagram account must be a <strong>Business</strong> or <strong>Creator</strong> account. Public Personal accounts are not supported by Meta&apos;s API.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full border border-cyan-300/15 bg-cyan-400/10 font-bold text-sm text-cyan-300">
                            2
                        </div>
                        <div className="space-y-1">
                            <h4 className="flex items-center gap-2 text-sm font-medium text-white/85"><ShieldCheck className="h-4 w-4 text-cyan-300" /> Approve focused permissions</h4>
                            <p className="text-xs leading-relaxed text-white/50">
                                SwiftFlow asks only for basic professional-account access and comment management for this automation setup.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full border border-amber-300/15 bg-amber-400/10 font-bold text-sm text-amber-300">
                            3
                        </div>
                        <div className="space-y-1">
                            <h4 className="flex items-center gap-2 text-sm font-medium text-white/85"><Webhook className="h-4 w-4 text-amber-300" /> Verify automations</h4>
                            <p className="text-xs leading-relaxed text-white/50">
                                The guided setup subscribes comment webhooks and checks token health before marking the account ready.
                            </p>
                        </div>
                    </div>
                </div>

                <DialogFooter className="sm:justify-start">
                    <Button
                        onClick={handleConnect}
                        disabled={isConnecting}
                        className="w-full gap-2 border border-cyan-300/20 bg-linear-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
                    >
                        {isConnecting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Connecting…
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="h-4 w-4" />
                                Open Instagram Quick Start
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
