import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Konsolidierung (Spec 2026-07-01): uploadGutachten macht KEIN Inline-Billing mehr —
// Leadpreis/Guthaben/gutachter_abrechnungen laufen ueber processCaseBilling
// (State-Machine @ gutachten-eingegangen, AAR-924). ABER der paket_faelle_genutzt-
// Increment bleibt: das ist der SV-Kapazitaets-/Dispatch-Counter (sv-zuweisung
// Load-Balancing), kein Billing.
describe('uploadGutachten: kein Inline-Billing, aber Kapazitaets-Counter bleibt', () => {
  const src = readFileSync('src/app/gutachter/fall/[id]/actions.ts', 'utf8')

  it('schreibt nicht mehr in gutachter_abrechnungen', () => {
    expect(src).not.toMatch(/from\('gutachter_abrechnungen'\)\s*\.insert/)
  })
  it('berechnet keinen Leadpreis mehr inline (getLeadPriceFromTable(betrag))', () => {
    expect(src).not.toMatch(/getLeadPriceFromTable\(betrag/)
  })
  it('zieht kein werbebudget_guthaben_netto mehr inline ab', () => {
    expect(src).not.toMatch(/werbebudget_guthaben_netto:\s*guthabenNachher/)
  })
  it('behaelt den paket_faelle_genutzt-Kapazitaets-Increment', () => {
    expect(src).toMatch(/paket_faelle_genutzt:\s*\(svData\.paket_faelle_genutzt \?\? 0\) \+ 1/)
  })
})
