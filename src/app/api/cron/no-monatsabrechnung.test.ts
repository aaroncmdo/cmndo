import { existsSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Konsolidierung (Spec 2026-07-01): der deprecated monatsabrechnung-Cron (System A,
// AAR-925) ist entfernt. System B (abrechnung-erstellen + processCaseBilling) ist kanonisch.
describe('monatsabrechnung-Cron entfernt', () => {
  it('Route existiert nicht mehr', () => {
    expect(existsSync('src/app/api/cron/monatsabrechnung/route.ts')).toBe(false)
  })
})
