import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Sicherheitsnetz fuer die Leadpreis-Billing-Konsolidierung (Spec 2026-07-01):
// Die konkurrierenden Charger (deductLeadpreis@Zuweisung, uploadGutachten-inline,
// monatsabrechnung-cron) werden entfernt. Das ist NUR sicher, solange die State-Machine
// die kanonischen Hooks feuert. Dieser Guard bricht, falls jemand sie entfernt.
describe('leadpreis-billing: kanonische State-Machine-Hooks', () => {
  const sm = readFileSync('src/lib/faelle/state-machine.ts', 'utf8')

  it('feuert processCaseBilling bei gutachten-eingegangen/abgeschlossen (AAR-924)', () => {
    expect(sm).toMatch(/processCaseBilling/)
    expect(sm).toMatch(/gutachten-eingegangen/)
  })

  it('feuert revertCaseBilling bei Storno (AAR-926) — ersetzt refundLeadpreis', () => {
    expect(sm).toMatch(/revertCaseBilling/)
  })
})
