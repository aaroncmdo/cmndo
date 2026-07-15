// src/lib/status/domains/fall-status.test.ts
import { describe, it, expect } from 'vitest'
import { FALL_STATUS_DEFS } from './fall-status'
import { FALL_STATUS_LABELS } from '@/lib/statusLabels'

describe('FALL_STATUS_DEFS', () => {
  it('has a def for every FALL_STATUS_LABELS code with the same label', () => {
    for (const code of Object.keys(FALL_STATUS_LABELS)) {
      expect(FALL_STATUS_DEFS[code]?.label).toBe(FALL_STATUS_LABELS[code])
    }
  })
  it('assigns semantic slots to terminal states', () => {
    expect(FALL_STATUS_DEFS['vs-reguliert'].slot).toBe('success')
    expect(FALL_STATUS_DEFS['storniert'].slot).toBe('danger')
    expect(FALL_STATUS_DEFS['abgelehnt'].slot).toBe('danger')
  })

  // B4/T4-Followup: die Fallakte-Badge (FallStatusBadge) speist claims.operative_status in die
  // fall-status-Domain. Jeder operative_status-CHECK-Wert MUSS ein Label haben, sonst zeigt die
  // Badge den rohen Slug. Diese Liste synchron zum claims_operative_status_check halten
  // (neuer Wert -> CHECK + FALL_STATUS_LABELS + hier). Vor diesem Fix fehlten 9 (5 feine Terminals
  // + 4 reparatur-*).
  const OPERATIVE_STATUS_VALUES = [
    'ersterfassung', 'onboarding', 'sv-gesucht', 'sv-zugewiesen', 'sv-termin', 'besichtigung',
    'begutachtung-laeuft', 'gutachten-eingegangen', 'filmcheck', 'qc-pruefung', 'kanzlei-uebergeben',
    'anschlussschreiben', 'regulierung', 'regulierung-laeuft', 'nachbesichtigung-laeuft',
    'zahlung-eingegangen', 'vs-abgelehnt', 'abgeschlossen', 'storniert', 'reparatur-werkstatt-suche',
    'reparatur-angefragt', 'reparatur-laeuft', 'reparatur-erledigt', 'vs-kuerzt', 'klage',
    'in_kommunikation_vs', 'abgelehnt', 'an_externe_kanzlei_uebergeben', 'reguliert_vollstaendig',
    'klage_rechtsstreit', 'verjaehrt', 'abgelehnt_final', 'termin_durchgefuehrt',
  ]
  it('labelt jeden operative_status-CHECK-Wert (kein roher Slug in der Fallakte-Badge)', () => {
    const missing = OPERATIVE_STATUS_VALUES.filter((code) => FALL_STATUS_DEFS[code]?.label === undefined)
    expect(missing).toEqual([])
  })
})
