import { describe, expect, it } from 'vitest'
import { developmentAllowedHosts } from '../config/development-hosts'

describe('development ingress hosts', () => {
  it('keeps local hosts and accepts an explicit deduplicated Gateway list', () => {
    expect(developmentAllowedHosts('DGX.K-LYNX.COM, dgx.k-lynx.com, khwan.k-lynx.com')).toEqual([
      'localhost',
      '127.0.0.1',
      '::1',
      'dgx.k-lynx.com',
      'khwan.k-lynx.com',
    ])
  })

  it('rejects URLs and host:port values rather than enabling broad access', () => {
    expect(developmentAllowedHosts('https://evil.example,evil.example:443, safe.example ')).toEqual([
      'localhost',
      '127.0.0.1',
      '::1',
      'safe.example',
    ])
  })
})
