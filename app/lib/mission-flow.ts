import type { Mission, MissionState, ProductFacts } from '../types/mission'

const stateOrder: MissionState[] = [
  'missionAccepted',
  'captureStarted',
  'assetsUploaded',
  'draftGenerating',
  'draftReady',
  'exported',
  'posted',
]

export interface ProgressItem {
  label: string
  complete: boolean
  current: boolean
}

export function missionProgress(mission?: Mission | null): ProgressItem[] {
  const currentIndex = mission ? stateOrder.indexOf(mission.state) : -1
  const assets = new Set((mission?.assets ?? []).map(asset => asset.shot))

  return [
    { label: 'เริ่มภารกิจแรก', complete: Boolean(mission), current: !mission },
    {
      label: 'ถ่ายครบ 3 ช็อต',
      complete: assets.size === 3,
      current: Boolean(mission) && assets.size < 3 && currentIndex <= 1,
    },
    {
      label: 'ได้โพสต์ฉบับร่าง',
      complete: currentIndex >= stateOrder.indexOf('draftReady'),
      current: currentIndex === stateOrder.indexOf('assetsUploaded') || currentIndex === stateOrder.indexOf('draftGenerating'),
    },
    {
      label: 'เตรียมไฟล์พร้อมโพสต์',
      complete: currentIndex >= stateOrder.indexOf('exported'),
      current: currentIndex === stateOrder.indexOf('draftReady'),
    },
    {
      label: 'โพสต์ชิ้นแรก',
      complete: currentIndex === stateOrder.indexOf('posted'),
      current: currentIndex === stateOrder.indexOf('exported'),
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
