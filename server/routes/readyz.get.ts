import { createProbeResponse } from '../utils/probes'

export default defineEventHandler(() => {
  const config = useRuntimeConfig()

  return createProbeResponse(
    'ready',
    config.public.appVersion,
    config.public.commitSha,
  )
})
