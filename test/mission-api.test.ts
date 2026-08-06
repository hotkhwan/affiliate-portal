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
    const api = createMissionApi('/v1/', fetcher as typeof fetch)

    await expect(api.create('alpha-user', mission.product)).resolves.toMatchObject({ id: 'mission-1' })
    expect(fetcher).toHaveBeenCalledWith('/v1/missions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ userId: 'alpha-user', product: mission.product }),
    }))
  })

  it('uploads raw media with the selected content type', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(mission), { status: 200 }))
    const api = createMissionApi('/v1', fetcher as typeof fetch)
    const media = new Blob(['jpeg'], { type: 'image/jpeg' })

    await api.upload('mission 1', 2, media)
    expect(fetcher).toHaveBeenCalledWith('/v1/missions/mission%201/assets/2', expect.objectContaining({
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: media,
    }))
  })

  it('preserves the structured API error without leaking a response body', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'invalid_state', message: 'mission cannot perform this action', requestId: 'request-1' },
    }), { status: 409, headers: { 'content-type': 'application/json' } }))
    const api = createMissionApi('/v1', fetcher as typeof fetch)

    await expect(api.generateDraft('mission-1')).rejects.toEqual(expect.objectContaining<Partial<MissionApiError>>({
      status: 409,
      code: 'invalid_state',
      requestId: 'request-1',
    }))
  })
})
