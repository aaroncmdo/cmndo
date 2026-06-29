import { describe, it, expect } from 'vitest'
import { kanzleiFaktToUpdate } from './fakt-mapping'

const D = '2026-06-29T10:00:00Z'

describe('kanzleiFaktToUpdate', () => {
  it('anschlussschreiben -> kanzlei_faelle.anschlussschreiben_am + Kunde-Comm as_gesendet', () => {
    expect(kanzleiFaktToUpdate('anschlussschreiben', { datum: D })).toEqual({
      kanzleiFaelle: { anschlussschreiben_am: D },
      commKey: 'as_gesendet',
    })
  })

  it('vs_reaktion voll -> typ+am, keine Kunde-Comm (Regulierung loest sie aus)', () => {
    expect(kanzleiFaktToUpdate('vs_reaktion', { datum: D, vsReaktionTyp: 'voll' })).toEqual({
      kanzleiFaelle: { vs_reaktion_typ: 'voll', vs_reaktion_am: D },
      commKey: null,
    })
  })

  it('vs_reaktion gekuerzt -> kuerzungs_betrag + grund', () => {
    expect(kanzleiFaktToUpdate('vs_reaktion', { datum: D, vsReaktionTyp: 'gekuerzt', betrag: 1200, grund: 'Stundensatz' })).toEqual({
      kanzleiFaelle: { vs_reaktion_typ: 'gekuerzt', vs_reaktion_am: D, kuerzungs_betrag: 1200, vs_kuerzung_grund: 'Stundensatz' },
      commKey: null,
    })
  })

  it('vs_reaktion abgelehnt -> grund (kein betrag-Feld)', () => {
    expect(kanzleiFaktToUpdate('vs_reaktion', { datum: D, vsReaktionTyp: 'abgelehnt', grund: 'Haftung bestritten' })).toEqual({
      kanzleiFaelle: { vs_reaktion_typ: 'abgelehnt', vs_reaktion_am: D, vs_kuerzung_grund: 'Haftung bestritten' },
      commKey: null,
    })
  })

  it('regulierung -> regulierung_am + Kunde-Comm regulierung_angekuendigt', () => {
    expect(kanzleiFaktToUpdate('regulierung', { datum: D })).toEqual({
      kanzleiFaelle: { regulierung_am: D },
      commKey: 'regulierung_angekuendigt',
    })
  })

  it('klage mit Grund -> klage_uebergeben_am + claims.geschlossen_grund', () => {
    expect(kanzleiFaktToUpdate('klage', { datum: D, grund: 'VS zahlt nicht' })).toEqual({
      kanzleiFaelle: { klage_uebergeben_am: D },
      claims: { geschlossen_grund: 'VS zahlt nicht' },
      commKey: null,
    })
  })

  it('klage ohne Grund -> kein claims-Feld', () => {
    expect(kanzleiFaktToUpdate('klage', { datum: D })).toEqual({
      kanzleiFaelle: { klage_uebergeben_am: D },
      claims: undefined,
      commKey: null,
    })
  })

  it('zahlung -> claim_payments (zahlungseingang_am + erhaltener_betrag + status erhalten) + Comm', () => {
    expect(kanzleiFaktToUpdate('zahlung', { datum: D, betrag: 4500 })).toEqual({
      payment: { zahlungseingang_am: D, erhaltener_betrag: 4500, status: 'erhalten' },
      commKey: 'zahlung_eingegangen',
    })
  })

  it('zahlung ohne Betrag -> nur zahlungseingang_am + status', () => {
    expect(kanzleiFaktToUpdate('zahlung', { datum: D })).toEqual({
      payment: { zahlungseingang_am: D, status: 'erhalten' },
      commKey: 'zahlung_eingegangen',
    })
  })

  it('abschluss -> claims.abgeschlossen_am, keine Kunde-Comm', () => {
    expect(kanzleiFaktToUpdate('abschluss', { datum: D })).toEqual({
      claims: { abgeschlossen_am: D },
      commKey: null,
    })
  })
})
