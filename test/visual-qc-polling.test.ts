import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVisualQcPoller } from '../app/lib/visual-qc'
import type { Mission, ProcessingJob } from '../app/types/mission'

function job(state: ProcessingJob['state']): ProcessingJob {
  return { id: 'visual-1', kind: 'visualQc', state, attempt: 1, idempotencyKey: 'visual:m1:1', updatedAt: '2026-08-09T00:00:00Z' }
}

function mission(state: ProcessingJob['state']): Mission {
  return {
    id: 'm1',
    userId: 'u1',
    product: { name: 'สินค้า', description: 'รายละเอียด' },
    state: 'exported',
    shots: [],
    visualQc: { history: [], job: job(state) },
    version: 1,
    createdAt: '2026-08-09T00:00:00Z',
    updatedAt: '2026-08-09T00:00:00Z',
  }
}

afterEach(() => vi.useRealTimers())

describe('visual QC background polling', () => {
  it('updates a completed report without requiring a page reload', async () => {
    vi.useFakeTimers()
    let current = mission('queued')
    const completed = {
      ...mission('succeeded'),
      visualQc: {
        history: [],
        job: job('succeeded'),
        latestReport: {
          revision: 1,
          modelRevision: 'shotvl-revision',
          threshold: 0.75,
          score: 0.8,
          passed: true,
          evidenceFrames: [],
          shots: [],
          createdAt: '2026-08-09T00:01:00Z',
        },
      },
    } satisfies Mission
    const refresh = vi.fn().mockResolvedValue(completed)
    const poller = createVisualQcPoller({
      current: () => current,
      refresh,
      update: value => { current = value },
      intervalMs: 1_000,
    })

    poller.start()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(refresh).toHaveBeenCalledOnce()
    expect(current.visualQc?.latestReport?.modelRevision).toBe('shotvl-revision')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does not block the caller and stops a bounded unavailable poll', async () => {
    vi.useFakeTimers()
    const current = mission('running')
    const refresh = vi.fn().mockRejectedValue(new Error('cold load'))
    const poller = createVisualQcPoller({
      current: () => current,
      refresh,
      update: vi.fn(),
      intervalMs: 100,
      maxAttempts: 2,
    })

    expect(poller.start()).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('cancels pending work when the view is unmounted', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn()
    const poller = createVisualQcPoller({
      current: () => mission('queued'),
      refresh,
      update: vi.fn(),
      intervalMs: 1_000,
    })

    poller.start()
    poller.stop()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(refresh).not.toHaveBeenCalled()
  })
})
