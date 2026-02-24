"use client"

function DarkSkeleton({ className }: { className?: string }) {
    return (
        <div
            className={`animate-pulse rounded-md ${className ?? ''}`}
            style={{ background: 'rgba(255,255,255,0.05)' }}
        />
    )
}

export function AnalyticsLoadingSkeleton() {
    return (
        <div className="space-y-6">
            {/* Header skeleton */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                    <DarkSkeleton className="h-8 w-36" />
                    <DarkSkeleton className="h-4 w-64" />
                </div>
                <div className="flex items-center gap-3">
                    <DarkSkeleton className="h-9 w-40" />
                    <DarkSkeleton className="h-9 w-44" />
                    <DarkSkeleton className="h-9 w-20" />
                    <DarkSkeleton className="h-9 w-24" />
                </div>
            </div>

            {/* KPI cards skeleton */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div
                        key={i}
                        className="rounded-xl p-5 space-y-3"
                        style={{ background: '#151620', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                        <div className="flex items-center justify-between">
                            <DarkSkeleton className="h-3 w-24" />
                            <DarkSkeleton className="h-8 w-8 rounded-lg" />
                        </div>
                        <DarkSkeleton className="h-8 w-20" />
                        <DarkSkeleton className="h-3 w-32" />
                    </div>
                ))}
            </div>

            {/* Follower growth chart skeleton */}
            <div
                className="rounded-xl overflow-hidden"
                style={{ background: '#151620', border: '1px solid rgba(255,255,255,0.08)' }}
            >
                <div className="px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <DarkSkeleton className="h-4 w-36 mb-2" />
                    <DarkSkeleton className="h-3 w-56" />
                </div>
                <div className="px-4 pb-4 pt-5 space-y-4">
                    <DarkSkeleton className="h-[300px] w-full" />
                    <div
                        className="grid grid-cols-3 gap-4 pt-4"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                    >
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-3">
                                <DarkSkeleton className="h-8 w-8 rounded-lg shrink-0" />
                                <div className="space-y-1.5">
                                    <DarkSkeleton className="h-3 w-14" />
                                    <DarkSkeleton className="h-4 w-10" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Cards grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Latest post */}
                <div
                    className="rounded-xl overflow-hidden"
                    style={{ background: '#151620', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                    <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <DarkSkeleton className="h-4 w-24" />
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="flex items-center gap-2">
                            <DarkSkeleton className="h-3 w-16" />
                            <DarkSkeleton className="h-5 w-20 rounded-full" />
                        </div>
                        <div className="space-y-2">
                            <DarkSkeleton className="h-3 w-full" />
                            <DarkSkeleton className="h-3 w-full" />
                            <DarkSkeleton className="h-3 w-3/4" />
                        </div>
                        <div className="flex items-center gap-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <DarkSkeleton className="h-3 w-10" />
                            <DarkSkeleton className="h-3 w-10" />
                            <DarkSkeleton className="h-3 w-10" />
                        </div>
                    </div>
                </div>

                {/* Account analytics */}
                <div
                    className="rounded-xl overflow-hidden"
                    style={{ background: '#151620', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                    <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <DarkSkeleton className="h-4 w-36 mb-1" />
                        <DarkSkeleton className="h-3 w-20" />
                    </div>
                    <div className="p-5">
                        <div className="grid grid-cols-3 gap-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="text-center space-y-2">
                                    <DarkSkeleton className="h-9 w-9 rounded-xl mx-auto" />
                                    <DarkSkeleton className="h-6 w-12 mx-auto" />
                                    <DarkSkeleton className="h-3 w-16 mx-auto" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Other posts */}
                <div
                    className="rounded-xl overflow-hidden"
                    style={{ background: '#151620', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                    <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <DarkSkeleton className="h-4 w-24" />
                    </div>
                    <div className="p-5 space-y-0">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="py-4 space-y-2"
                                style={i < 3 ? { borderBottom: '1px solid rgba(255,255,255,0.05)' } : undefined}
                            >
                                <DarkSkeleton className="h-3 w-16" />
                                <DarkSkeleton className="h-3 w-full" />
                                <DarkSkeleton className="h-3 w-5/6" />
                                <div className="flex items-center gap-4">
                                    <DarkSkeleton className="h-3 w-8" />
                                    <DarkSkeleton className="h-3 w-8" />
                                    <DarkSkeleton className="h-3 w-8" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
