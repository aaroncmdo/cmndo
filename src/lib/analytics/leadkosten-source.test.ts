import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Konsolidierung (Spec 2026-07-01): alle Leadpreis-Reader lesen aus claims.lead_preis_*
// (SSoT, processCaseBilling) statt aus der retireten gutachter_abrechnungen-Tabelle.
// Assertion prueft die tatsaechliche Query (.from('gutachter_abrechnungen')), nicht
// Kommentare/Doku, die die Migration erklaeren.
describe('Leadpreis-Reader lesen aus claims, nicht gutachter_abrechnungen', () => {
  it.each([
    'src/lib/analytics/finance.ts',
    'src/lib/analytics/sv-performance.ts',
    'src/lib/finance/fall-finanzen.ts',
    'src/app/gutachter/abrechnung/page.tsx',
    'src/app/gutachter/fall/[id]/page.tsx',
    'src/lib/email/google/flows.ts',
  ])('%s hat keinen .from(gutachter_abrechnungen)-Query mehr', (f) => {
    expect(readFileSync(f, 'utf8')).not.toMatch(/from\('gutachter_abrechnungen'\)/)
  })
})
