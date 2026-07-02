import { describe, it, expect } from 'vitest'
import { berechneQcAutoChecks, slotVorhanden, SA_SLOTS, VOLLMACHT_SLOTS } from './auto-checks'

const P = (slot: string, vorhanden: boolean) => ({ slot_id: slot, vorhanden })

describe('slotVorhanden', () => {
  it('true wenn EIN passender Slot vorhanden ist', () => {
    expect(slotVorhanden([P('halter_vollmacht', true)], VOLLMACHT_SLOTS)).toBe(true)
    expect(slotVorhanden([P('sa_vollmacht', true)], SA_SLOTS)).toBe(true)
  })
  it('false wenn passender Slot existiert aber nicht vorhanden', () => {
    expect(slotVorhanden([P('halter_vollmacht', false)], VOLLMACHT_SLOTS)).toBe(false)
  })
  it('false wenn kein passender Slot in der Liste', () => {
    expect(slotVorhanden([P('schadensfotos', true)], VOLLMACHT_SLOTS)).toBe(false)
    expect(slotVorhanden([], SA_SLOTS)).toBe(false)
  })
})

describe('berechneQcAutoChecks', () => {
  it('leitet gutachten_vorhanden aus gutachtenUrlVorhanden ab', () => {
    expect(berechneQcAutoChecks({ gutachtenUrlVorhanden: true, vorschaedenGeprueft: null, pflichtItems: [] }).gutachten_vorhanden).toBe(true)
    expect(berechneQcAutoChecks({ gutachtenUrlVorhanden: false, vorschaedenGeprueft: null, pflichtItems: [] }).gutachten_vorhanden).toBe(false)
  })

  it('leitet sa_vorhanden + vollmacht_vorhanden aus pflichtItems ab', () => {
    const r = berechneQcAutoChecks({
      gutachtenUrlVorhanden: true,
      vorschaedenGeprueft: null,
      pflichtItems: [P('sa_vollmacht', true), P('halter_vollmacht', true)],
    })
    expect(r.sa_vorhanden).toBe(true)
    expect(r.vollmacht_vorhanden).toBe(true)
  })

  it('vorschaeden_beruecksichtigt: abgeleitet wenn geprueft true/false, ABSENT wenn null', () => {
    expect(berechneQcAutoChecks({ gutachtenUrlVorhanden: true, vorschaedenGeprueft: true, pflichtItems: [] }).vorschaeden_beruecksichtigt).toBe(true)
    expect(berechneQcAutoChecks({ gutachtenUrlVorhanden: true, vorschaedenGeprueft: false, pflichtItems: [] }).vorschaeden_beruecksichtigt).toBe(false)
    expect('vorschaeden_beruecksichtigt' in berechneQcAutoChecks({ gutachtenUrlVorhanden: true, vorschaedenGeprueft: null, pflichtItems: [] })).toBe(false)
  })

  it('ohne Phase-1b-Quellen bleiben fin/kundendaten offen; gutachten_vollstaendig/fotos/positionen immer offen', () => {
    const r = berechneQcAutoChecks({ gutachtenUrlVorhanden: true, vorschaedenGeprueft: true, pflichtItems: [P('sa_vollmacht', true)] })
    for (const offen of ['fin_17_zeichen', 'kundendaten_vollstaendig', 'gutachten_vollstaendig', 'fotos_ausreichend', 'schadenspositionen_erfasst']) {
      expect(offen in r).toBe(false)
    }
  })

  // Phase 1b (02.07.): FIN aus v_claim_full.fin_vin, kundendaten aus v_claim_full kunde_*/besichtigung.
  it('fin_17_zeichen: 17 Zeichen -> true, abweichend -> false, getrimmt; null/absent -> nicht abgeleitet', () => {
    const base = { gutachtenUrlVorhanden: true, vorschaedenGeprueft: null, pflichtItems: [] }
    expect(berechneQcAutoChecks({ ...base, finVin: 'WVWZZZ1KZAW000123' }).fin_17_zeichen).toBe(true)
    expect(berechneQcAutoChecks({ ...base, finVin: 'ABC123' }).fin_17_zeichen).toBe(false)
    expect(berechneQcAutoChecks({ ...base, finVin: '  WVWZZZ1KZAW000123  ' }).fin_17_zeichen).toBe(true)
    expect('fin_17_zeichen' in berechneQcAutoChecks({ ...base, finVin: null })).toBe(false)
    expect('fin_17_zeichen' in berechneQcAutoChecks(base)).toBe(false)
  })

  it('kundendaten_vollstaendig: Name + Kontakt + Besichtigungsadresse (NICHT Kunde-Anschrift)', () => {
    const base = { gutachtenUrlVorhanden: true, vorschaedenGeprueft: null, pflichtItems: [] }
    const voll = {
      vorname: 'Max',
      nachname: 'Muster',
      email: 'm@x.de',
      telefon: null,
      besichtigungsadresse: 'Werkstatt-Str. 1, 10115 Berlin',
    }
    expect(berechneQcAutoChecks({ ...base, kundendaten: voll }).kundendaten_vollstaendig).toBe(true)
    // Kontakt via Telefon reicht
    expect(berechneQcAutoChecks({ ...base, kundendaten: { ...voll, email: null, telefon: '030-1' } }).kundendaten_vollstaendig).toBe(true)
    // fehlende Besichtigungsadresse -> false (das ist das wichtige, nicht die Kunde-Anschrift)
    expect(berechneQcAutoChecks({ ...base, kundendaten: { ...voll, besichtigungsadresse: null } }).kundendaten_vollstaendig).toBe(false)
    // fehlender Kontakt -> false
    expect(berechneQcAutoChecks({ ...base, kundendaten: { ...voll, email: null, telefon: null } }).kundendaten_vollstaendig).toBe(false)
    // fehlender Name -> false
    expect(berechneQcAutoChecks({ ...base, kundendaten: { ...voll, nachname: null } }).kundendaten_vollstaendig).toBe(false)
  })

  it('kundendaten_vollstaendig: Firma braucht Ansprechpartner (Person) — sonst false (Aaron 02.07.)', () => {
    const base = { gutachtenUrlVorhanden: true, vorschaedenGeprueft: null, pflichtItems: [] }
    // Firma ohne Ansprechpartner (kein Personen-Name) -> unvollstaendig
    expect(
      berechneQcAutoChecks({
        ...base,
        kundendaten: { vorname: null, nachname: null, email: 'firma@x.de', telefon: null, besichtigungsadresse: 'Berlin' },
      }).kundendaten_vollstaendig,
    ).toBe(false)
    // Firma MIT Ansprechpartner -> vollstaendig
    expect(
      berechneQcAutoChecks({
        ...base,
        kundendaten: { vorname: 'Erika', nachname: 'Chef', email: 'firma@x.de', telefon: null, besichtigungsadresse: 'Berlin' },
      }).kundendaten_vollstaendig,
    ).toBe(true)
  })

  it('kundendaten_vollstaendig: absent wenn keine Kundendaten uebergeben', () => {
    expect(
      'kundendaten_vollstaendig' in
        berechneQcAutoChecks({ gutachtenUrlVorhanden: true, vorschaedenGeprueft: null, pflichtItems: [] }),
    ).toBe(false)
  })
})
