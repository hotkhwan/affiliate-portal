import type { ApiErrorBody, Mission, ProductFacts } from '../types/mission'

type Fetcher = typeof globalThis.fetch
export const PRIVACY_NOTICE_VERSION = '2026-08-08'

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

export function createMissionApi(
  baseUrl: string,
  getAuthenticatedUserId: () => string,
  fetcher: Fetcher = globalThis.fetch,
  timeout = { requestMs: 30_000, longRequestMs: 120_000 },
) {
  const base = baseUrl.replace(/\/$/, '')

  async function request(path: string, init?: RequestInit, timeoutMs = timeout.requestMs): Promise<Mission> {
    const response = await fetcher(`${base}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        'X-Authenticated-User-ID': getAuthenticatedUserId(),
      },
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    })
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
    create(product: ProductFacts, consentAccepted: boolean, privacyNoticeVersion = PRIVACY_NOTICE_VERSION) {
      return request('/missions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product, consentAccepted, privacyNoticeVersion }),
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
    uploadProductReference(id: string, index: number, file: File | Blob) {
      return request(`/missions/${encodeURIComponent(id)}/product-references/${index}`, {
        method: 'PUT',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      })
    },
    generateDraft(id: string) {
      return request(`/missions/${encodeURIComponent(id)}/draft`, { method: 'POST' }, timeout.longRequestMs)
    },
    exportDraft(id: string) {
      return request(`/missions/${encodeURIComponent(id)}/export`, { method: 'POST' }, timeout.longRequestMs)
    },
    markPosted(id: string, platform: string, postUrl?: string) {
      return request(`/missions/${encodeURIComponent(id)}/posted`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform, postUrl: postUrl || undefined }),
      })
    },
    recordOutcome(id: string, views: number, clicks: number, sales: number) {
      return request(`/missions/${encodeURIComponent(id)}/outcome`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ views, clicks, sales }),
      })
    },
  }
}
