// A quiet idle tick still invokes the worker and returns exactly the same data.
export function shouldLogSchedulerSuccess(job: string, data: unknown, minute: number): boolean {
  if (job !== 'process-scheduled-executions' || minute === 0) return true
  if (!data || typeof data !== 'object') return true
  const result = data as Record<string, unknown>
  const reclaim = result.reclaim as Record<string, unknown> | undefined
  // Only suppress the established, successful no-work response. Unknown/new
  // responses and every non-idle outcome remain visible.
  return !(result.success === true && result.count === 0
    && result.message === 'No pending executions'
    && Number(result.expiredApprovals || 0) === 0
    && Number(reclaim?.reclaimed || 0) === 0
    && Number(reclaim?.abandoned || 0) === 0)
}
