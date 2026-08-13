import type { Mission } from '../types/mission'

export async function downloadLatestMissionVideo(
  missionId: string,
  getMission: (id: string) => Promise<Mission>,
  documentRef: Document,
): Promise<Mission> {
  const fresh = await getMission(missionId)
  const url = fresh.export?.downloadUrl
  if (!url) throw new Error('download URL is unavailable')
  const link = documentRef.createElement('a')
  link.href = url
  link.download = `kwanni-${fresh.id}.mp4`
  link.rel = 'noopener'
  documentRef.body.appendChild(link)
  link.click()
  link.remove()
  return fresh
}
