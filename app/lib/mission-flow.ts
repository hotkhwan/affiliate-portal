import type { Mission, MissionState, ProductFacts } from '../types/mission'

const stateOrder: MissionState[] = [
  'missionAccepted',
  'captureStarted',
  'assetsUploaded',
  'draftGenerating',
  'draftReady',
  'videoGenerating',
  'exportQueued',
  'exported',
  'posted',
  'resultRecorded',
  'nextMissionReady',
]

export interface ProgressItem {
  label: string
  complete: boolean
  current: boolean
}

export type MissionStep = 'product' | 'capture' | 'draft' | 'export' | 'post'

export function missionStep(mission: Mission | null | undefined, _captureReviewed = false): MissionStep {
  if (!mission) return 'product'
  if (!(mission.productReferences?.length)) return 'capture'
  if (!mission.draft) return 'draft'
  return mission.export ? 'post' : 'export'
}

export function missionProgress(mission?: Mission | null): ProgressItem[] {
  const currentIndex = mission ? stateOrder.indexOf(mission.state) : -1
  const hasReference = Boolean(mission?.productReferences?.length)

  return [
    { label: 'เริ่มภารกิจแรก', complete: Boolean(mission), current: !mission },
    {
      label: 'เพิ่มภาพสินค้า 1 ภาพ',
      complete: hasReference,
      current: Boolean(mission) && !hasReference,
    },
    {
      label: 'ทีม Creative วางแผน',
      complete: currentIndex >= stateOrder.indexOf('draftReady'),
      current: currentIndex === stateOrder.indexOf('assetsUploaded') || currentIndex === stateOrder.indexOf('draftGenerating'),
    },
    {
      label: 'Prompt Veo / Seedance พร้อมใช้',
      complete: Boolean(mission?.draft?.renderPrompts),
      current: currentIndex >= stateOrder.indexOf('draftReady'),
    },
  ]
}

export function uploadedShotNumbers(mission?: Mission | null): Set<number> {
  return new Set((mission?.assets ?? []).map(asset => asset.shot))
}

export function parseFacts(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(fact => fact.trim())
    .filter(Boolean)
}

export function validateProduct(product: ProductFacts): string | null {
  if (!product.name.trim()) return 'ใส่ชื่อสินค้าที่อยากลองก่อนนะ'
  if (!product.description.trim()) return 'เล่าสั้น ๆ ว่าสินค้านี้ใช้ทำอะไร'
  if (product.name.trim().length > 120) return 'ชื่อสินค้าต้องไม่เกิน 120 ตัวอักษร'
  if (product.description.trim().length > 800) return 'รายละเอียดสินค้าต้องไม่เกิน 800 ตัวอักษร'
  if ((product.facts ?? []).length > 20) return 'ใส่ข้อเท็จจริงได้ไม่เกิน 20 ข้อ'
  return null
}

export const acceptedMediaTypes = ['image/jpeg', 'image/png', 'video/mp4'] as const

export function validateMedia(file: Pick<File, 'size' | 'type'>): string | null {
  if (!acceptedMediaTypes.includes(file.type as typeof acceptedMediaTypes[number])) {
    return 'รองรับเฉพาะภาพ JPG, PNG หรือวิดีโอ MP4'
  }
  if (file.size <= 0) return 'ไฟล์นี้ว่างเปล่า กรุณาเลือกไฟล์ใหม่'
  if (file.size > 8 * 1024 * 1024) return 'ไฟล์ใหญ่เกิน 8 MB กรุณาเลือกภาพหรือคลิปที่สั้นลง'
  return null
}

export function validateProductReferenceMedia(file: Pick<File, 'size' | 'type'>): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'ภาพสินค้าต้องเป็น JPG, PNG หรือ WebP'
  if (file.size <= 0) return 'ไฟล์นี้ว่างเปล่า กรุณาเลือกไฟล์ใหม่'
  if (file.size > 8 * 1024 * 1024) return 'ไฟล์ใหญ่เกิน 8 MB กรุณาเลือกภาพที่เล็กลง'
  return null
}

export function captionText(mission: Mission): string {
  if (!mission.draft) return ''
  return [
    mission.draft.caption,
    mission.draft.cta,
    mission.draft.hashtags.join(' '),
  ].filter(Boolean).join('\n\n')
}

function presignedExpiry(value: string): number | null {
  try {
    const url = new URL(value, 'https://kwanni.invalid')
    const unixExpiry = Number(url.searchParams.get('Expires'))
    if (Number.isFinite(unixExpiry) && unixExpiry > 0) return unixExpiry * 1000

    const issued = url.searchParams.get('X-Amz-Date')
    const lifetime = Number(url.searchParams.get('X-Amz-Expires'))
    const match = issued?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
    if (!match || !Number.isFinite(lifetime) || lifetime <= 0) return null
    const [, year, month, day, hour, minute, second] = match
    return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) + lifetime * 1000
  }
  catch {
    return null
  }
}

export function shouldRefreshExport(mission: Mission, now = Date.now()): boolean {
  if (mission.state === 'videoGenerating') return true
  if (mission.state === 'exportQueued') return true
  if (mission.state !== 'exported') return false
  if (!mission.export?.downloadUrl) return true

  const expiry = presignedExpiry(mission.export.downloadUrl)
  if (expiry !== null) return expiry <= now + 30_000

  const updatedAt = Date.parse(mission.updatedAt)
  return Number.isFinite(updatedAt) && updatedAt <= now - 14 * 60_000
}

export function canPostMission(mission?: Mission | null): boolean {
  if (!mission?.export || mission.state === 'exportQueued' || mission.state === 'videoGenerating') return false
  return mission.exportJob?.state !== 'queued' && mission.exportJob?.state !== 'running' && mission.exportJob?.state !== 'failed'
}
