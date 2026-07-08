import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('health/funnel route — test-daten-bewusster Funnel', () => {
  const src = readFileSync('src/app/api/health/funnel/route.ts', 'utf8')
  it('ist CRON_SECRET-gated', () => {
    expect(src).toMatch(/CRON_SECRET/)
    expect(src).toMatch(/401/)
  })
  it('liest die test-bereinigte v_funnel_real (nicht die rohen Tabellen)', () => {
    expect(src).toContain('v_funnel_real')
    expect(src).not.toMatch(/\.from\('claims'\)/)
    expect(src).not.toMatch(/\.from\('leads'\)/)
  })
})
