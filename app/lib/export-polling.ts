import type { Mission } from '../types/mission'

export interface ExportPoller {
  start: () => void
  stop: () => void
}

export interface ExportPollerOptions {
  current: () => Mission | null
  refresh: (missionId: string) => Promise<Mission>
  update: (mission: Mission) => void
  intervalMs?: number
  maxAttempts?: number
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  cancel?: (timer: ReturnType<typeof setTimeout>) => void
}

export function exportPending(mission?: Mission | null): boolean {
  return mission?.state === 'exportQueued' || mission?.exportJob?.state === 'queued' || mission?.exportJob?.state === 'running'
}

export function createExportPoller(options: ExportPollerOptions): ExportPoller {
  const intervalMs = options.intervalMs ?? 3_000
  const maxAttempts = options.maxAttempts ?? 100
  const schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay))
  const cancel = options.cancel ?? (timer => clearTimeout(timer))
  let timer: ReturnType<typeof setTimeout> | undefined
  let active = false
  let attempts = 0
  let generation = 0

  function stop() {
    active = false
    attempts = 0
    generation += 1
    if (timer !== undefined) {
      cancel(timer)
      timer = undefined
    }
  }

  function scheduleNext(runGeneration: number) {
    if (!active || timer !== undefined || runGeneration !== generation) return
    timer = schedule(() => {
      timer = undefined
      void poll(runGeneration)
    }, intervalMs)
  }

  async function poll(runGeneration: number) {
    const before = options.current()
    if (!active || runGeneration !== generation || !before?.id || !exportPending(before)) {
      stop()
      return
    }
    attempts += 1
    try {
      const refreshed = await options.refresh(before.id)
      if (!active || runGeneration !== generation) return
      options.update(refreshed)
    }
    catch {
      // Keep the rest of the mission usable and retry within a fixed bound.
    }
    if (!active || runGeneration !== generation) return
    if (!exportPending(options.current()) || attempts >= maxAttempts) {
      stop()
      return
    }
    scheduleNext(runGeneration)
  }

  return {
    start() {
      if (active || !exportPending(options.current())) return
      active = true
      attempts = 0
      generation += 1
      scheduleNext(generation)
    },
    stop,
  }
}
