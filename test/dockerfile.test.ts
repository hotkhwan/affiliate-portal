import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8')

describe('Dockerfile healthcheck', () => {
  it('uses a validated runtime port', () => {
    expect(dockerfile).toContain('Number(process.env.PORT||3000)')
    expect(dockerfile).toContain('Number.isInteger(p)||p<1||p>65535')
    expect(dockerfile).toContain('http://127.0.0.1:${p}/healthz')
    expect(dockerfile).not.toContain('http://127.0.0.1:3000/healthz')
  })
})
