import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Struktureller Guard fuer den Golden-Path-Kern. Die echte Ausfuehrung (DB-treibend)
// laeuft gegen Prod via /api/cron/golden-path (Task 5/6) — headless im vitest nicht sinnvoll.
describe('golden-path core', () => {
  const src = readFileSync('src/lib/health/golden-path.ts', 'utf8')

  it('exportiert runGoldenPath', () => {
    expect(src).toMatch(/export async function runGoldenPath/)
  })
  it('raeumt im finally auf (delete_fall_komplett)', () => {
    expect(src).toMatch(/finally/)
    expect(src).toMatch(/delete_fall_komplett/)
  })
  it('hat idempotentes Pre-Cleanup', () => {
    expect(src).toMatch(/async function preCleanup/)
    expect(src).toMatch(/preCleanup\(admin\)/)
  })
  it('treibt bis abgeschlossen', () => {
    expect(src).toMatch(/driveTo\('abgeschlossen'\)/)
  })
  it('assertet den Billing-Hook (lead_preis_netto)', () => {
    expect(src).toMatch(/lead_preis_netto/)
    expect(src).toMatch(/Billing-Hook feuerte nicht/)
  })
  it('nutzt @claimondo.test-Kontakt (Comms-Safety)', () => {
    expect(src).toMatch(/@claimondo\.test/)
  })
})
