import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Konsolidierung (Spec 2026-07-01): gutachterTasking enthaelt keine Leadpreis-/
// Guthaben-Logik mehr. Storno-Refund laeuft ueber revertCaseBilling (State-Machine
// AAR-926), Charge ueber processCaseBilling (AAR-924) — beide claims-SSoT.
describe('gutachterTasking: keine Leadpreis-/Guthaben-Logik mehr', () => {
  const gt = readFileSync('src/lib/gutachterTasking.ts', 'utf8')

  it.each(['calculateLeadpreis', 'deductLeadpreis', 'refundLeadpreis'])('exportiert %s nicht mehr', (fn) => {
    expect(gt).not.toMatch(new RegExp(`function ${fn}\\b`))
  })
})
