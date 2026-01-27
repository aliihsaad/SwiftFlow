"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function MessagesLoadingSkeleton() {
    return (
        <div className="flex h-[calc(100%-5rem)] mt-6 border rounded-lg overflow-hidden bg-background">
            {/* Conversation list skeleton */}
            <div className="w-80 border-r flex-shrink-0">
                <div className="divide-y divide-border/50">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="flex items-start gap-3 p-4">
                            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center justify-between">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-3 w-12" />
                                </div>
                                <Skeleton className="h-3 w-36" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Message thread skeleton */}
            <div className="flex-1 flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-3 p-4 border-b">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="space-y-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 p-4 space-y-4">
                    <div className="flex gap-2 justify-start">
                        <Skeleton className="h-7 w-7 rounded-full" />
                        <Skeleton className="h-10 w-48 rounded-2xl" />
                    </div>
                    <div className="flex gap-2 justify-end">
                        <Skeleton className="h-10 w-36 rounded-2xl" />
                    </div>
                    <div className="flex gap-2 justify-start">
                        <Skeleton className="h-7 w-7 rounded-full" />
                        <Skeleton className="h-10 w-56 rounded-2xl" />
                    </div>
                    <div className="flex gap-2 justify-end">
                        <Skeleton className="h-10 w-44 rounded-2xl" />
                    </div>
                </div>

                {/* Input */}
                <div className="p-4 border-t">
                    <div className="flex gap-2">
                        <Skeleton className="h-11 flex-1 rounded-md" />
                        <Skeleton className="h-11 w-11 rounded-md" />
                    </div>
                </div>
            </div>
        </div>
    )
}
