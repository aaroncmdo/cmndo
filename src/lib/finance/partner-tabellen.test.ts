import { describe, it, expect } from 'vitest'
import { partnerTabelleFuer, PARTNER_TABELLE } from './partner-tabellen'

describe('partnerTabelleFuer — Empfaenger-Tabelle je partner_typ', () => {
  it('makler -> makler', () => {
    expect(partnerTabelleFuer('makler')).toBe('makler')
  })

  it('werkstatt -> werkstaetten', () => {
    expect(partnerTabelleFuer('werkstatt')).toBe('werkstaetten')
  })

  it('firmen_flotte -> firmen (Aaron 14.07.: Empfaenger ist die FIRMA, nicht das Flotten-Konto)', () => {
    // Der Trigger schreibt seit Mig 20260714094208 partner_id = firmen.id.
    // Vorher fiel firmen_flotte in den werkstaetten-Fallback => Auszahlung brach mit
    // "USt-Status des Partners unbekannt".
    expect(partnerTabelleFuer('firmen_flotte')).toBe('firmen')
  })

  it('marketing -> marketing_partner (eigener Ledger provisionen_maik)', () => {
    expect(partnerTabelleFuer('marketing')).toBe('marketing_partner')
  })

  it('unbekannter Typ -> null (KEIN stiller Fallback auf werkstaetten)', () => {
    // Der alte Ternary (partnerTyp === 'makler' ? 'makler' : 'werkstaetten') liess jeden
    // unbekannten Typ still gegen werkstaetten laufen — der Grund, warum firmen_flotte
    // ueberhaupt unbemerkt brach. Unbekannt muss sichtbar scheitern.
    expect(partnerTabelleFuer('kanzlei')).toBeNull()
    expect(partnerTabelleFuer('')).toBeNull()
  })

  it('alle partner_provisionen-CHECK-Werte sind abgedeckt', () => {
    // DB-CHECK partner_provisionen_partner_typ_check (Mig 20260713181418).
    for (const typ of ['makler', 'werkstatt', 'firmen_flotte']) {
      expect(PARTNER_TABELLE[typ as keyof typeof PARTNER_TABELLE]).toBeTruthy()
    }
  })
})
