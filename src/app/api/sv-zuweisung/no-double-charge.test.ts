import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Konsolidierung (Spec 2026-07-01): SV wird NICHT mehr bei Zuweisung belastet.
// Der Leadpreis-Abzug laeuft ausschliesslich ueber processCaseBilling
// (State-Machine-Hook @ gutachten-eingegangen, AAR-924).
describe('sv-zuweisung: kein Leadpreis-Abzug bei Zuweisung (Charger #1 raus)', () => {
  it('ruft deductLeadpreis nicht mehr auf', () => {
    const src = readFileSync('src/app/api/sv-zuweisung/route.ts', 'utf8')
    expect(src).not.toMatch(/deductLeadpreis/)
  })
})
