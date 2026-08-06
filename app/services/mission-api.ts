import type { ApiErrorBody, Mission, ProductFacts } from '../types/mission'

type Fetcher = typeof globalThis.fetch

export class MissionApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly requestId?: string,
  ) {
    super(message)
    this.name = 'MissionApiError'
  }
}

export function createMissionApi(baseUrl: string, fetcher: Fetcher = globalThis.fetch) {
  const base = baseUrl.replace(/\/$/, '')

  async function request(path: string, init?: RequestInit): Promise<Mission> {
    const response = await fetcher(`${base}${path}`, init)
    if (!response.ok) {
      let body: ApiErrorBody = {}
      try {
        body = await response.json() as ApiErrorBody
      }
      catch {
        // The API can fail before a structured body is available.
      }
      throw new MissionApiError(
        body.error?.message || 'ไม่สามารถทำรายการนี้ได้ กรุณาลองอีกครั้ง',
        response.status,
        body.error?.code,
        body.error?.requestId,
      )
    }
    return await response.json() as Mission
  }

  return {
    create(userId: string, product: ProductFacts) {
      return request('/missions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, product }),
      })
    },
    get(id: string) {
      return request(`/missions/${encodeURIComponent(id)}`)
    },
    upload(id: string, shot: number, file: File | Blob) {
      return request(`/missions/${encodeURIComponent(id)}/assets/${shot}`, {
        method: 'PUT',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      })
    },
    generateDraft(id: string) {
      return request(`/missions/${encodeURIComponent(id)}/draft`, { method: 'POST' })
    },
    exportDraft(id: string) {
      return request(`/missions/${encodeURIComponent(id)}/export`, { method: 'POST' })
    },
    markPosted(id: string, platform: string, postUrl?: string) {
      return request(`/missions/${encodeURIComponent(id)}/posted`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform, postUrl: postUrl || undefined }),
      })
    },
  }
}
