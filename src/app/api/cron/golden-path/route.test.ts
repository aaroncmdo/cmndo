import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('cron/golden-path route', () => {
  const src = readFileSync('src/app/api/cron/golden-path/route.ts', 'utf8')

  it('ist per CRON_SECRET gated', () => {
    expect(src).toMatch(/CRON_SECRET/)
    expect(src).toMatch(/401/)
  })
  it('ruft runGoldenPath', () => {
    expect(src).toMatch(/runGoldenPath/)
  })
  it('alertet bei Fehler (Dead-Letter) + resolved bei Erfolg', () => {
    expect(src).toMatch(/recordFailedOperation/)
    expect(src).toMatch(/markOperationResolved/)
  })
})
