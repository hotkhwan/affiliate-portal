import { describe, expect, it } from 'vitest'
import { canPostMission, captionText, missionProgress, missionStep, parseFacts, shouldRefreshExport, uploadedShotNumbers, validateMedia, validateProduct, validateProductReferenceMedia } from '../app/lib/mission-flow'
import type { Mission } from '../app/types/mission'

function fixture(state: Mission['state'] = 'missionAccepted'): Mission {
  return {
    id: 'mission-1',
    userId: 'alpha-user',
    product: { name: 'กล่องจัดระเบียบ', description: 'ช่วยแยกของเล่น' },
    state,
    shots: [
      { number: 1, instruction: 'ถ่ายก่อนใช้' },
      { number: 2, instruction: 'ถ่ายตอนใช้' },
      { number: 3, instruction: 'ถ่ายหลังใช้' },
    ],
    version: 1,
    createdAt: '2026-08-06T00:00:00Z',
    updatedAt: '2026-08-06T00:00:00Z',
  }
}

describe('mission flow helpers', () => {
  it('keeps the first mission current before a mission exists', () => {
    const progress = missionProgress(null)
    expect(progress[0]).toMatchObject({ complete: false, current: true })
    expect(progress.filter(item => item.complete)).toHaveLength(0)
  })

  it('tracks distinct uploaded shots and the draft milestone', () => {
    const mission = fixture('draftReady')
    mission.assets = [
      { shot: 1, storageKey: 'one', contentType: 'image/jpeg', bytes: 1, sha256: 'a' },
      { shot: 2, storageKey: 'two', contentType: 'video/mp4', bytes: 2, sha256: 'b' },
      { shot: 3, storageKey: 'three', contentType: 'image/png', bytes: 3, sha256: 'c' },
    ]

    expect([...uploadedShotNumbers(mission)]).toEqual([1, 2, 3])
    expect(missionProgress(mission).map(item => item.complete)).toEqual([true, true, true, false, false])
  })

  it('requires an explicit capture review before draft generation', () => {
    const mission = fixture('assetsUploaded')
    mission.productReferences = [{ index: 1, storageKey: 'product', contentType: 'image/jpeg', bytes: 1, sha256: 'p' }]
    mission.assets = [1, 2, 3].map(shot => ({ shot, storageKey: `${shot}`, contentType: 'image/jpeg', bytes: 1, sha256: `${shot}` }))

    expect(missionStep(mission, false)).toBe('review')
    expect(missionStep(mission, true)).toBe('draft')
    mission.assets.pop()
    expect(missionStep(mission, true)).toBe('capture')
  })

  it('builds a copyable caption without exposing its provider', () => {
    const mission = fixture('draftReady')
    mission.draft = {
      caption: 'ลองกล่องจัดระเบียบแบบง่าย ๆ',
      cta: 'ดูรายละเอียดจากลิงก์ที่แนบไว้',
      hashtags: ['#ลองแล้วบอกต่อ', '#Affiliate'],
      timeline: [],
      generatedBy: 'deterministic-fallback',
    }

    expect(captionText(mission)).toBe('ลองกล่องจัดระเบียบแบบง่าย ๆ\n\nดูรายละเอียดจากลิงก์ที่แนบไว้\n\n#ลองแล้วบอกต่อ #Affiliate')
    expect(captionText(mission)).not.toContain('deterministic-fallback')
  })

  it('normalizes product facts and validates the two required facts', () => {
    expect(parseFacts(' มีล้อ \n\nฝาถอดได้\r\n')).toEqual(['มีล้อ', 'ฝาถอดได้'])
    expect(validateProduct({ name: '', description: 'ใช้จัดของ' })).toBeTruthy()
    expect(validateProduct({ name: 'กล่อง', description: '' })).toBeTruthy()
    expect(validateProduct({ name: 'กล่อง', description: 'ใช้จัดของ' })).toBeNull()
  })

  it('accepts only bounded JPG, PNG, and MP4 capture assets', () => {
    expect(validateMedia({ type: 'image/jpeg', size: 1 })).toBeNull()
    expect(validateMedia({ type: 'video/mp4', size: 8 * 1024 * 1024 })).toBeNull()
    expect(validateMedia({ type: 'image/webp', size: 1 })).toContain('JPG')
    expect(validateMedia({ type: 'image/png', size: 0 })).toContain('ว่างเปล่า')
    expect(validateMedia({ type: 'image/png', size: 8 * 1024 * 1024 + 1 })).toContain('8 MB')
  })

  it('accepts WebP only for the product reference path', () => {
    expect(validateProductReferenceMedia({ type: 'image/webp', size: 12 })).toBeNull()
    expect(validateProductReferenceMedia({ type: 'video/mp4', size: 12 })).toContain('ภาพสินค้า')
  })

  it('refreshes queued, absent, or expiring export downloads through the idempotent export endpoint', () => {
    const now = Date.UTC(2026, 7, 9, 1, 0, 0)
    const mission = fixture('exportQueued')
    expect(shouldRefreshExport(mission, now)).toBe(true)

    mission.state = 'exported'
    mission.export = { storageKey: 'video', format: 'video/mp4', width: 1080, height: 1920 }
    expect(shouldRefreshExport(mission, now)).toBe(true)

    mission.export.downloadUrl = 'https://s3.example/video?X-Amz-Date=20260809T005000Z&X-Amz-Expires=600'
    expect(shouldRefreshExport(mission, now)).toBe(true)

    mission.export.downloadUrl = 'https://s3.example/video?X-Amz-Date=20260809T005500Z&X-Amz-Expires=900'
    expect(shouldRefreshExport(mission, now)).toBe(false)

    mission.state = 'posted'
    expect(shouldRefreshExport(mission, now)).toBe(false)
  })

  it('never lets advisory visual QC block an otherwise completed export', () => {
    const mission = fixture('exported')
    mission.export = { storageKey: 'video', format: 'video/mp4', width: 1080, height: 1920, downloadUrl: 'https://s3/video' }
    mission.exportJob = { id: 'export-1', kind: 'ffmpegExport', state: 'succeeded', attempt: 1, idempotencyKey: 'export:1', updatedAt: mission.updatedAt }
    mission.visualQc = { history: [], warning: 'ShotVL cold start failed' }
    expect(canPostMission(mission)).toBe(true)

    mission.state = 'exportQueued'
    expect(canPostMission(mission)).toBe(false)
  })
})
