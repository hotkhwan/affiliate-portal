import { describe, expect, it } from 'vitest'
import { captionText, missionProgress, parseFacts, uploadedShotNumbers, validateProduct } from '../app/lib/mission-flow'
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
})
