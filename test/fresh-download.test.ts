// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { downloadLatestMissionVideo } from '../app/lib/fresh-download'
import type { Mission } from '../app/types/mission'

describe('fresh video download', () => {
  it('gets a newly signed URL immediately before starting the download', async () => {
    const expired = 'https://s3.example/video.mp4?X-Amz-Date=20260813T032825Z&X-Amz-Expires=900'
    const fresh = 'https://s3.example/video.mp4?X-Amz-Date=20260813T040000Z&X-Amz-Expires=900'
    const mission = { id: 'mission-1', export: { downloadUrl: fresh } } as Mission
    const getMission = vi.fn(async () => mission)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    const result = await downloadLatestMissionVideo('mission-1', getMission, document)

    expect(getMission).toHaveBeenCalledWith('mission-1')
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelector(`a[href="${expired}"]`)).toBeNull()
    expect(result.export?.downloadUrl).toBe(fresh)
    click.mockRestore()
  })
})
