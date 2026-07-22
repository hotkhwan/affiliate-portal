import { describe, expect, it } from 'vitest'
import { createProbeResponse } from '../server/utils/probes'

describe('createProbeResponse', () => {
  it('exposes the supplied health metadata', () => {
    expect(createProbeResponse('ok', '1.2.3', 'abc123')).toEqual({
      status: 'ok',
      version: '1.2.3',
      commit: 'abc123',
    })
  })

  it('supports the readiness state', () => {
    expect(createProbeResponse('ready', '1.2.3', 'abc123').status).toBe('ready')
  })
})
