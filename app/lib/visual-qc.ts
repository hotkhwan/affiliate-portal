import type { Mission, VisualQCDefect, VisualQCState } from '../types/mission'

export type VisualQCDisplayState = 'idle' | 'checking' | 'passed' | 'attention' | 'unavailable'

export function visualQcDisplayState(value?: VisualQCState): VisualQCDisplayState {
  if (!value) return 'idle'
  if (value.warning || value.job?.state === 'failed') return 'unavailable'
  if (value.latestReport) return value.latestReport.passed ? 'passed' : 'attention'
  if (value.job?.state === 'queued' || value.job?.state === 'running') return 'checking'
  return 'idle'
}

export function visualQcScore(value: number): string {
  const bounded = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  return `${Math.round(bounded * 100)}%`
}

export function visualQcDefects(value?: VisualQCState): VisualQCDefect[] {
  const order = { critical: 0, warning: 1, info: 2 }
  return (value?.latestReport?.shots ?? [])
    .flatMap(shot => shot.defects)
    .sort((left, right) => order[left.severity] - order[right.severity])
}

export interface VisualQcPollerOptions {
  current: () => Mission | null
  refresh: (missionId: string) => Promise<Mission>
  update: (mission: Mission) => void
  intervalMs?: number
  maxAttempts?: number
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  cancel?: (timer: ReturnType<typeof setTimeout>) => void
}

export interface VisualQcPoller {
  start: () => void
  stop: () => void
}

function visualQcPending(mission?: Mission | null): boolean {
  const state = mission?.visualQc?.job?.state
  return state === 'queued' || state === 'running'
}

// Visual QC is advisory, so polling deliberately runs outside the page's busy
// state. A slow or unavailable critic must never disable download or posting.
export function createVisualQcPoller(options: VisualQcPollerOptions): VisualQcPoller {
  const intervalMs = options.intervalMs ?? 5_000
  // Six minutes covers the API's five-minute visual worker lease while still
  // guaranteeing that a lost job cannot poll forever.
  const maxAttempts = options.maxAttempts ?? 72
  const schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay))
  const cancel = options.cancel ?? (timer => clearTimeout(timer))
  let timer: ReturnType<typeof setTimeout> | undefined
  let active = false
  let attempts = 0
  let generation = 0

  function stop() {
    active = false
    generation += 1
    attempts = 0
    if (timer !== undefined) {
      cancel(timer)
      timer = undefined
    }
  }

  function queueNext(runGeneration: number) {
    if (!active || timer !== undefined || runGeneration !== generation) return
    timer = schedule(() => {
      timer = undefined
      void poll(runGeneration)
    }, intervalMs)
  }

  async function poll(runGeneration: number) {
    const before = options.current()
    const missionId = before?.id
    if (!active || runGeneration !== generation || !missionId || !visualQcPending(before)) {
      stop()
      return
    }

    attempts += 1
    try {
      const refreshed = await options.refresh(missionId)
      if (!active || runGeneration !== generation) return
      options.update(refreshed)
    }
    catch {
      // The normal page remains usable. A later bounded poll may recover.
    }

    if (!active || runGeneration !== generation) return
    if (!visualQcPending(options.current()) || attempts >= maxAttempts) {
      stop()
      return
    }
    queueNext(runGeneration)
  }

  return {
    start() {
      if (active || !visualQcPending(options.current())) return
      active = true
      attempts = 0
      generation += 1
      queueNext(generation)
    },
    stop,
  }
}
