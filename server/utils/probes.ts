export interface ProbeResponse {
  status: 'ok' | 'ready'
  version: string
  commit: string
}

export function createProbeResponse(
  status: ProbeResponse['status'],
  version: string,
  commit: string,
): ProbeResponse {
  return { status, version, commit }
}
