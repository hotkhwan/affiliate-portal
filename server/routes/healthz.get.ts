import { createProbeResponse } from '../utils/probes'

export default defineEventHandler(() => {
  const config = useRuntimeConfig()

  return createProbeResponse(
    'ok',
    config.public.appVersion,
    config.public.commitSha,
  )
})
