import { describe, it, expect } from 'vitest'
import { klassifiziereFestgefahren } from './festgefahrene-faelle'

// Die Live-Klassifikation ist der Kern der Dispatch-Ansicht: sie entscheidet
// (unabhaengig vom teils stale sla_tracking.status) ob + wie ein Claim haengt.
describe('klassifiziereFestgefahren', () => {
  it('kein SV zugewiesen -> kritisch: Gutachter zuweisen', () => {
    expect(klassifiziereFestgefahren({ hatSv: false, hatBestaetigtenTermin: false })).toEqual({
      kind: 'kein_gutachter',
      aktionLabel: 'Gutachter zuweisen',
    })
  })

  it('kein SV -> kein_gutachter, auch wenn (widerspruechlich) ein Termin bestaetigt waere', () => {
    // Defensive: ohne SV ist "Gutachter zuweisen" immer der richtige Schritt.
    expect(klassifiziereFestgefahren({ hatSv: false, hatBestaetigtenTermin: true })?.kind).toBe(
      'kein_gutachter',
    )
  })

  it('SV da, Termin unbestaetigt -> Warnung: Termin-Bestaetigung nachfassen', () => {
    expect(klassifiziereFestgefahren({ hatSv: true, hatBestaetigtenTermin: false })).toEqual({
      kind: 'termin_unbestaetigt',
      aktionLabel: 'Termin-Bestätigung nachfassen',
    })
  })

  it('SV da + bestaetigter Termin -> laeuft -> null (ausblenden)', () => {
    // Das ist genau der Fall, den der stale sla_tracking.status faelschlich noch
    // als "breached" fuehren wuerde (completeSla nicht gerufen) — hier gefiltert.
    expect(klassifiziereFestgefahren({ hatSv: true, hatBestaetigtenTermin: true })).toBeNull()
  })
})
