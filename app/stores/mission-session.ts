import type { Mission, ProductFacts } from '../types/mission'

export const ACTIVE_MISSION_KEY = 'kwanni-active-mission'
export const ALPHA_USER_KEY = 'kwanni-alpha-user'
export const PRODUCT_DRAFT_KEY = 'kwanni-product-draft'

export interface ProductFormDraft extends ProductFacts {
  factsText: string
}

export interface MissionSession {
  getUserId: () => string
  activeMissionId: () => string | null
  saveMission: (mission: Mission) => void
  clearMission: () => void
  loadProductDraft: () => ProductFormDraft | null
  saveProductDraft: (draft: ProductFormDraft) => void
  clearProductDraft: () => void
}

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  }
  catch {
    return null
  }
}

function safeSet(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value)
  }
  catch {
    // Storage can be unavailable in private mode; the current page still works.
  }
}

function safeRemove(storage: Storage, key: string) {
  try {
    storage.removeItem(key)
  }
  catch {
    // A failed cleanup must not block the mission.
  }
}

export function createMissionSession(
  storage: Storage,
  createId: () => string = () => crypto.randomUUID(),
): MissionSession {
  let memoryUserId = safeGet(storage, ALPHA_USER_KEY)

  return {
    getUserId() {
      if (memoryUserId) return memoryUserId
      memoryUserId = `alpha-${createId()}`
      safeSet(storage, ALPHA_USER_KEY, memoryUserId)
      return memoryUserId
    },
    activeMissionId() {
      return safeGet(storage, ACTIVE_MISSION_KEY)
    },
    saveMission(mission) {
      safeSet(storage, ACTIVE_MISSION_KEY, mission.id)
    },
    clearMission() {
      safeRemove(storage, ACTIVE_MISSION_KEY)
    },
    loadProductDraft() {
      const raw = safeGet(storage, PRODUCT_DRAFT_KEY)
      if (!raw) return null
      try {
        const value = JSON.parse(raw) as Partial<ProductFormDraft>
        if (typeof value.name !== 'string' || typeof value.description !== 'string' || typeof value.factsText !== 'string') return null
        return {
          name: value.name,
          description: value.description,
          price: typeof value.price === 'string' ? value.price : '',
          promotion: typeof value.promotion === 'string' ? value.promotion : '',
          factsText: value.factsText,
        }
      }
      catch {
        return null
      }
    },
    saveProductDraft(draft) {
      safeSet(storage, PRODUCT_DRAFT_KEY, JSON.stringify(draft))
    },
    clearProductDraft() {
      safeRemove(storage, PRODUCT_DRAFT_KEY)
    },
  }
}
