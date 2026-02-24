"use client"

function DarkSkeleton({ className }: { className?: string }) {
    return (
        <div
            className={`animate-pulse rounded-md ${className ?? ''}`}
            style={{ background: 'rgba(255,255,255,0.05)' }}
        />
    )
}

export function MessagesLoadingSkeleton() {
    return (
        <div
            className="flex mt-6 overflow-hidden rounded-xl"
            style={{
                height: 'calc(100% - 5rem)',
                background: '#151620',
                border: '1px solid rgba(255,255,255,0.08)',
            }}
        >
            {/* Conversation list skeleton */}
            <div className="w-80 flex-shrink-0" style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                {[...Array(8)].map((_, i) => (
                    <div
                        key={i}
                        className="flex items-start gap-3 px-4 py-3.5"
                        style={i < 7 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : undefined}
                    >
                        <DarkSkeleton className="h-10 w-10 rounded-full shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between">
                                <DarkSkeleton className="h-3.5 w-24" />
                                <DarkSkeleton className="h-3 w-10" />
                            </div>
                            <DarkSkeleton className="h-3 w-36" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Thread skeleton */}
            <div className="flex-1 flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <DarkSkeleton className="h-9 w-9 rounded-full" />
                    <div className="space-y-1.5">
                        <DarkSkeleton className="h-3.5 w-24" />
                        <DarkSkeleton className="h-3 w-16" />
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 px-4 py-4 space-y-4">
                    <div className="flex gap-2 justify-start">
                        <DarkSkeleton className="h-7 w-7 rounded-full" />
                        <DarkSkeleton className="h-10 w-48 rounded-2xl" />
                    </div>
                    <div className="flex gap-2 justify-end">
                        <DarkSkeleton className="h-10 w-36 rounded-2xl" />
                    </div>
                    <div className="flex gap-2 justify-start">
                        <DarkSkeleton className="h-7 w-7 rounded-full" />
                        <DarkSkeleton className="h-10 w-56 rounded-2xl" />
                    </div>
                    <div className="flex gap-2 justify-end">
                        <DarkSkeleton className="h-10 w-44 rounded-2xl" />
                    </div>
                </div>

                {/* Input */}
                <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex gap-2">
                        <DarkSkeleton className="h-11 flex-1 rounded-xl" />
                        <DarkSkeleton className="h-11 w-11 rounded-xl" />
                        <DarkSkeleton className="h-11 w-11 rounded-xl" />
                    </div>
                </div>
            </div>
        </div>
    )
}
