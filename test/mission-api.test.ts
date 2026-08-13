import { describe, expect, it, vi } from 'vitest'
import { createMissionApi } from '../app/services/mission-api'
import type { MissionApiError } from '../app/services/mission-api'

const mission = {
  id: 'mission-1',
  userId: 'alpha-user',
  product: { name: 'กล่อง', description: 'ใช้จัดของ' },
  state: 'missionAccepted',
  shots: [],
  version: 1,
  createdAt: '2026-08-06T00:00:00Z',
  updatedAt: '2026-08-06T00:00:00Z',
}

describe('mission API client', () => {
  it('creates a mission at the contract endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(mission), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }))
    const api = createMissionApi('/v1/', () => 'alpha-user', fetcher as typeof fetch)

    await expect(api.create(mission.product, true)).resolves.toMatchObject({ id: 'mission-1' })
    expect(fetcher).toHaveBeenCalledWith('/v1/missions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ product: mission.product, consentAccepted: true, privacyNoticeVersion: '2026-08-08', locale: 'th' }),
      headers: expect.objectContaining({ 'X-Authenticated-User-ID': 'alpha-user' }),
    }))
  })

  it('uploads product references and records observed outcomes at their contract endpoints', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(mission), { status: 200 }))
    const api = createMissionApi('/v1', () => 'alpha-user', fetcher as typeof fetch)
    const image = new Blob(['png'], { type: 'image/png' })

    await api.uploadProductReference('mission-1', 1, image)
    expect(fetcher).toHaveBeenLastCalledWith('/v1/missions/mission-1/product-references/1', expect.objectContaining({ method: 'PUT', body: image }))

    await api.recordOutcome('mission-1', 100, 5, 1)
    expect(fetcher).toHaveBeenLastCalledWith('/v1/missions/mission-1/outcome', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ views: 100, clicks: 5, sales: 1 }),
    }))
  })

  it('uploads raw media with the selected content type', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(mission), { status: 200 }))
    const api = createMissionApi('/v1', () => 'alpha-user', fetcher as typeof fetch)
    const media = new Blob(['jpeg'], { type: 'image/jpeg' })

    await api.upload('mission 1', 2, media)
    expect(fetcher).toHaveBeenCalledWith('/v1/missions/mission%201/assets/2', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'content-type': 'image/jpeg', 'X-Authenticated-User-ID': 'alpha-user' }),
      body: media,
    }))
  })

  it('preserves the structured API error without leaking a response body', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'invalid_state', message: 'mission cannot perform this action', requestId: 'request-1' },
    }), { status: 409, headers: { 'content-type': 'application/json' } }))
    const api = createMissionApi('/v1', () => 'alpha-user', fetcher as typeof fetch)

    await expect(api.generateDraft('mission-1')).rejects.toEqual(expect.objectContaining<Partial<MissionApiError>>({
      status: 409,
      code: 'invalid_state',
      requestId: 'request-1',
    }))
  })

  it('uses the longer configurable deadline only for planning and export work', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(mission), { status: 200 }))
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const api = createMissionApi('/v1', () => 'alpha-user', fetcher as typeof fetch, { requestMs: 1_000, longRequestMs: 9_000 })

    await api.get('mission-1')
    await api.generateDraft('mission-1')
    await api.exportDraft('mission-1')

    expect(timeout.mock.calls.map(call => call[0])).toEqual([1_000, 9_000, 9_000])
    timeout.mockRestore()
  })

  it('starts advisory visual QC and records an explicit human override', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(mission), { status: 200 }))
    const api = createMissionApi('/v1', () => 'alpha-user', fetcher as typeof fetch)

    await api.requestVisualQc('mission-1')
    expect(fetcher).toHaveBeenLastCalledWith('/v1/missions/mission-1/visual-qc', expect.objectContaining({ method: 'POST' }))

    await api.overrideVisualQc('mission-1', 'accept', 'ตรวจด้วยตาแล้วตรงกับสินค้าจริง')
    expect(fetcher).toHaveBeenLastCalledWith('/v1/missions/mission-1/visual-qc/override', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ decision: 'accept', reason: 'ตรวจด้วยตาแล้วตรงกับสินค้าจริง' }),
    }))
  })

  it('queues the local Wan preview without exposing runtime credentials', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(mission), { status: 202 }))
    const api = createMissionApi('/v1', () => 'alpha-user', fetcher as typeof fetch)

    await api.generateVideo('mission-1', 'wan')
    expect(fetcher).toHaveBeenCalledWith('/v1/missions/mission-1/generate-video', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ provider: 'wan' }),
      headers: expect.not.objectContaining({ WAN_API_KEY: expect.anything() }),
    }))
  })
})
