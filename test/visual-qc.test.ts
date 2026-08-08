import { describe, expect, it } from 'vitest'
import { visualQcDefects, visualQcDisplayState, visualQcScore } from '../app/lib/visual-qc'
import type { VisualQCState } from '../app/types/mission'

function qc(passed = false): VisualQCState {
  return {
    history: [],
    latestReport: {
      revision: 1,
      modelRevision: 'shotvl-7b-r1',
      threshold: 0.8,
      score: 0.72,
      passed,
      createdAt: '2026-08-09T00:00:00Z',
      evidenceFrames: [{ id: 'frame-1', storageKey: 'frames/1.jpg', timestampMs: 500 }],
      shots: [{
        shotId: 'shot01',
        metrics: { shotSize: 1, composition: 0.8, cameraAngle: 1, depth: 0.7, lighting: 0.9, subjectPlacement: 0.8, productPlacement: 0.6 },
        defects: [
          { code: 'minor', severity: 'info', message: 'ข้อมูล', evidenceFrameIds: [] },
          { code: 'product', severity: 'critical', message: 'ฉลากไม่ชัด', evidenceFrameIds: ['frame-1'] },
        ],
      }],
    },
  }
}

describe('visual QC presentation', () => {
  it('maps advisory lifecycle without implying a posting gate', () => {
    expect(visualQcDisplayState()).toBe('idle')
    expect(visualQcDisplayState({ history: [], job: { id: 'j', kind: 'visualQc', state: 'queued', attempt: 0, idempotencyKey: 'k', updatedAt: '2026-08-09T00:00:00Z' } })).toBe('checking')
    expect(visualQcDisplayState(qc(true))).toBe('passed')
    expect(visualQcDisplayState(qc(false))).toBe('attention')
    expect(visualQcDisplayState({ ...qc(true), warning: 'โมเดลยังไม่พร้อม' })).toBe('unavailable')
  })

  it('bounds score display and puts critical defects first', () => {
    expect(visualQcScore(0.724)).toBe('72%')
    expect(visualQcScore(2)).toBe('100%')
    expect(visualQcDefects(qc())[0]).toMatchObject({ code: 'product', severity: 'critical' })
  })
})
