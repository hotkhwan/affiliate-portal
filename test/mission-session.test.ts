import { describe, expect, it } from 'vitest'
import { ACTIVE_MISSION_KEY, ALPHA_USER_KEY, createMissionSession, PRODUCT_DRAFT_KEY } from '../app/stores/mission-session'
import type { Mission } from '../app/types/mission'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

describe('mission session', () => {
  it('creates one anonymous alpha identity and resumes the active mission', () => {
    const storage = new MemoryStorage()
    const session = createMissionSession(storage, () => 'fixed-id')
    expect(session.getUserId()).toBe('alpha-fixed-id')
    expect(session.getUserId()).toBe('alpha-fixed-id')
    expect(storage.getItem(ALPHA_USER_KEY)).toBe('alpha-fixed-id')

    session.saveMission({ id: 'mission-1' } as Mission)
    expect(session.activeMissionId()).toBe('mission-1')
    session.clearMission()
    expect(storage.getItem(ACTIVE_MISSION_KEY)).toBeNull()
  })

  it('round-trips a product draft and rejects malformed stored data', () => {
    const storage = new MemoryStorage()
    const session = createMissionSession(storage)
    const draft = { name: 'กล่อง', description: 'จัดของ', price: '', promotion: '', factsText: 'มีล้อ' }
    session.saveProductDraft(draft)
    expect(session.loadProductDraft()).toEqual(draft)

    storage.setItem(PRODUCT_DRAFT_KEY, '{broken')
    expect(session.loadProductDraft()).toBeNull()
    session.clearProductDraft()
    expect(storage.getItem(PRODUCT_DRAFT_KEY)).toBeNull()
  })

  it('keeps the page usable when browser storage is unavailable', () => {
    const storage = new Proxy(new MemoryStorage(), {
      get() { throw new Error('denied') },
    }) as Storage
    const session = createMissionSession(storage, () => 'fallback')
    expect(session.getUserId()).toBe('alpha-fallback')
    expect(() => session.clearMission()).not.toThrow()
  })
})
