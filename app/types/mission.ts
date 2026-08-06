export type MissionState
  = | 'missionAccepted'
    | 'captureStarted'
    | 'assetsUploaded'
    | 'draftGenerating'
    | 'draftReady'
    | 'exported'
    | 'posted'

export interface ProductFacts {
  name: string
  description: string
  price?: string
  promotion?: string
  facts?: string[]
}

export interface MissionShot {
  number: number
  instruction: string
}

export interface MissionAsset {
  shot: number
  storageKey: string
  contentType: string
  bytes: number
  sha256: string
}

export interface MissionDraft {
  caption: string
  cta: string
  hashtags: string[]
  timeline: Array<{
    shot: number
    storageKey: string
    startMs: number
    endMs: number
  }>
  generatedBy: string
}

export interface MissionExport {
  storageKey: string
  format: string
  width: number
  height: number
}

export interface MissionPosted {
  platform: string
  postUrl?: string
  at: string
}

export interface Mission {
  id: string
  userId: string
  product: ProductFacts
  state: MissionState
  shots: MissionShot[]
  assets?: MissionAsset[]
  draft?: MissionDraft
  export?: MissionExport
  posted?: MissionPosted
  version: number
  createdAt: string
  updatedAt: string
}

export interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    requestId?: string
  }
}
