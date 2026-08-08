import type { VisualQCDefect, VisualQCState } from '../types/mission'

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
