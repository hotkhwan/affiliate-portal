import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExportPoller } from '../app/lib/export-polling'
import type { Mission } from '../app/types/mission'

function mission(state: Mission['state']): Mission {
  return {
    id: 'm1', userId: 'u1', product: { name: 'p', description: 'd' }, state, shots: [], version: 1,
    exportJob: { id: 'e1', kind: 'ffmpegExport', state: state === 'exported' ? 'succeeded' : 'running', attempt: 1, idempotencyKey: 'e:m1', updatedAt: '2026-08-09T00:00:00Z' },
    createdAt: '2026-08-09T00:00:00Z', updatedAt: '2026-08-09T00:00:00Z',
  }
}

afterEach(() => vi.useRealTimers())

describe('export polling', () => {
  it('updates a queued export without manual refresh and then stops', async () => {
    vi.useFakeTimers()
    let current = mission('exportQueued')
    const refresh = vi.fn().mockResolvedValue(mission('exported'))
    const poller = createExportPoller({ current: () => current, refresh, update: value => { current = value }, intervalMs: 100 })
    poller.start()
    await vi.advanceTimersByTimeAsync(100)
    expect(current.state).toBe('exported')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('stops bounded retries and cancels on unmount', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn().mockRejectedValue(new Error('network'))
    const poller = createExportPoller({ current: () => mission('exportQueued'), refresh, update: vi.fn(), intervalMs: 100, maxAttempts: 2 })
    poller.start()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(refresh).toHaveBeenCalledTimes(2)
    poller.stop()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
