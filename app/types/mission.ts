export type MissionState
  = | 'missionAccepted'
    | 'captureStarted'
    | 'assetsUploaded'
    | 'draftGenerating'
    | 'draftReady'
    | 'exported'
    | 'posted'
    | 'resultRecorded'
    | 'nextMissionReady'

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

export interface ProductReference {
  index: number
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
  productionSpec?: ProductionSpec
  roleExecutions?: RoleExecution[]
}

export interface ProductionSpec {
  schemaVersion: string
  projectType: string
  durationSeconds: number
  platform: string
  aspectRatio: string
  creativeIntent: string
  storyBeats: string[]
  continuity: Record<string, unknown>
  shots: Array<Record<string, unknown>>
  providerPrompts?: Record<string, string>
}

export interface RoleExecution {
  role: string
  runtime: string
}

export interface MissionExport {
  storageKey: string
  format: string
  width: number
  height: number
  jobId?: string
  downloadUrl?: string
}

export interface ProcessingJob {
  id: string
  kind: string
  state: 'queued' | 'running' | 'succeeded' | 'failed'
  attempt: number
  idempotencyKey: string
  lastError?: string
  updatedAt: string
}

export interface MissionOutcome {
  views: number
  clicks: number
  sales: number
  recordedAt: string
}

export interface NextAction {
  kind: string
  title: string
  reason: string
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
  productReferences?: ProductReference[]
  draft?: MissionDraft
  export?: MissionExport
  exportJob?: ProcessingJob
  posted?: MissionPosted
  outcome?: MissionOutcome
  nextAction?: NextAction
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
