"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function AnalyticsLoadingSkeleton() {
    return (
        <div className="space-y-6">
            {/* Header skeleton */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-40" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-40" />
                    <Skeleton className="h-10 w-48" />
                    <Skeleton className="h-10 w-28" />
                </div>
            </div>

            {/* KPI cards skeleton */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-4 rounded" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-20 mb-2" />
                            <Skeleton className="h-3 w-32" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Follower growth chart skeleton */}
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-64 mt-2" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-[300px] w-full" />
                    <div className="flex items-center justify-between mt-6 pt-4 border-t">
                        <div className="flex gap-6">
                            <div>
                                <Skeleton className="h-3 w-16 mb-1" />
                                <Skeleton className="h-4 w-12" />
                            </div>
                            <div>
                                <Skeleton className="h-3 w-16 mb-1" />
                                <Skeleton className="h-4 w-8" />
                            </div>
                            <div>
                                <Skeleton className="h-3 w-16 mb-1" />
                                <Skeleton className="h-4 w-8" />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Skeleton className="h-6 w-24 rounded-full" />
                            <Skeleton className="h-6 w-24 rounded-full" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Cards grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Latest post skeleton */}
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-24" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-5 w-20 rounded-full" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                        </div>
                        <div className="flex items-center gap-4 pt-4 border-t">
                            <Skeleton className="h-4 w-12" />
                            <Skeleton className="h-4 w-12" />
                            <Skeleton className="h-4 w-12" />
                        </div>
                    </CardContent>
                </Card>

                {/* Account analytics skeleton */}
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-3 w-20 mt-2" />
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="text-center space-y-2">
                                    <Skeleton className="h-8 w-8 rounded-full mx-auto" />
                                    <Skeleton className="h-6 w-12 mx-auto" />
                                    <Skeleton className="h-3 w-16 mx-auto" />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Other posts skeleton */}
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-24" />
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="space-y-2 pb-4 border-b last:border-0">
                                    <Skeleton className="h-3 w-16" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-full" />
                                    <div className="flex items-center gap-4">
                                        <Skeleton className="h-3 w-8" />
                                        <Skeleton className="h-3 w-8" />
                                        <Skeleton className="h-3 w-8" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
