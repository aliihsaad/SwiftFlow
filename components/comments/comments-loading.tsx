"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function CommentsLoadingSkeleton() {
    return (
        <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
                <Card key={i}>
                    <CardContent className="p-4">
                        <div className="flex gap-4">
                            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-5 w-20 rounded-full" />
                                    <Skeleton className="h-3 w-16" />
                                </div>
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                                <div className="flex items-center gap-2 pt-2">
                                    <Skeleton className="h-8 w-16" />
                                    <Skeleton className="h-8 w-16" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
