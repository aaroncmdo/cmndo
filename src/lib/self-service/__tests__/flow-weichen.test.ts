import { describe, it, expect } from 'vitest'
import { resolveFlowWeichen } from '../flow-weichen'

const basis = {
  schuldfrage: null as string | null,
  ueberEigeneVersicherung: null as boolean | null,
  freieWerkstattwahl: null as boolean | null,
  serviceTyp: 'komplett' as string | null,
  hatSvTermin: false,
  hatWerkstatt: false,
}

describe('resolveFlowWeichen', () => {
  it('gegner (Haftpflicht) -> Gutachter ja, Werkstatt ja, kein Rueckruf, Feststellung unfall', () => {
    expect(resolveFlowWeichen({ ...basis, schuldfrage: 'gegner' })).toEqual({
      abrechnungsweg: 'haftpflicht',
      brauchtGutachter: true,
      brauchtWerkstatt: true,
      brauchtRueckruf: false,
      feststellungZweig: 'unfall',
    })
  })

  it('unklar (Teilschuld) -> NUR Rueckruf, kein Gutachter, keine Werkstatt', () => {
    expect(resolveFlowWeichen({ ...basis, schuldfrage: 'unklar' })).toEqual({
      abrechnungsweg: null,
      brauchtGutachter: false,
      brauchtWerkstatt: false,
      brauchtRueckruf: true,
      feststellungZweig: 'unfall',
    })
  })

  it('eigenverantwortung + Kasko (freie Wahl) -> KEIN Gutachter, Werkstatt ja, Feststellung schaden', () => {
    expect(
      resolveFlowWeichen({
        ...basis,
        schuldfrage: 'eigenverantwortung',
        ueberEigeneVersicherung: true,
        freieWerkstattwahl: true,
      }),
    ).toEqual({
      abrechnungsweg: 'kasko',
      brauchtGutachter: false,
      brauchtWerkstatt: true,
      brauchtRueckruf: false,
      feststellungZweig: 'schaden',
    })
  })

  it('eigenverantwortung ohne Kasko (Selbstzahler) -> KEIN Gutachter, Werkstatt ja, Feststellung schaden', () => {
    expect(
      resolveFlowWeichen({
        ...basis,
        schuldfrage: 'eigenverantwortung',
        ueberEigeneVersicherung: false,
      }),
    ).toEqual({
      abrechnungsweg: 'selbstzahler',
      brauchtGutachter: false,
      brauchtWerkstatt: true,
      brauchtRueckruf: false,
      feststellungZweig: 'schaden',
    })
  })

  // Aarons "loses Ende" (14.07.): der Lead kommt mit SCHON GESETZTER schuldfrage rein (egal welche Tuer),
  // der Quali-Step entfaellt (qualiPending=false) -> der Selbstzahler-Short-Circuit greift NICHT.
  // Vorher: needsBooking war rein terminzustands-gegatet -> der Gutachter-Finder erschien faelschlich.
  it('REGRESSION loses Ende: Kasko-Lead ohne Termin, ohne Quali-Step -> KEIN Gutachter, ABER Werkstatt', () => {
    const w = resolveFlowWeichen({
      ...basis,
      schuldfrage: 'eigenverantwortung',
      ueberEigeneVersicherung: true,
      freieWerkstattwahl: true,
      hatSvTermin: false,
    })
    expect(w.brauchtGutachter).toBe(false)
    expect(w.brauchtWerkstatt).toBe(true)
  })

  // FlowWizardKfz:287 berechnete istHaftpflicht mit hardcodiertem ueberEigeneVersicherung: null,
  // weil eigene_versicherung nie an den Client durchgereicht wurde -> Kasko galt faelschlich als "nicht haftpflicht=null".
  it('REGRESSION lossy istHaftpflicht: eigenverantwortung+Kasko ist kasko, nicht haftpflicht', () => {
    const w = resolveFlowWeichen({
      ...basis,
      schuldfrage: 'eigenverantwortung',
      ueberEigeneVersicherung: true,
      freieWerkstattwahl: true,
    })
    expect(w.abrechnungsweg).toBe('kasko')
    expect(w.abrechnungsweg).not.toBe('haftpflicht')
  })

  // Die "scharfe Kante" (Makler-Audit): schuldfrage='eigenverantwortung' OHNE eigene_versicherung
  // ergibt abrechnungsweg=null -> der Lead wuerde still disqualifiziert. Die Weiche darf hier NICHTS
  // erzwingen; der Quali-Step MUSS die Kasko/Selbstzahler-Frage nachholen.
  it('eigenverantwortung, Versicherungsfrage noch offen -> Weg null, nichts erzwingen (Quali fragt nach)', () => {
    expect(
      resolveFlowWeichen({
        ...basis,
        schuldfrage: 'eigenverantwortung',
        ueberEigeneVersicherung: null,
      }),
    ).toEqual({
      abrechnungsweg: null,
      brauchtGutachter: false,
      brauchtWerkstatt: false,
      brauchtRueckruf: false,
      // Eigenverschulden steht bereits fest -> keine Unfall-Felder, unabhaengig von der VS-Frage.
      feststellungZweig: 'schaden',
    })
  })

  // Kasko + an die Versicherer-Werkstatt gebunden -> im Quali harter Abbruch (KaskoEndansicht).
  // istWerkstattReparaturWeg() schliesst freieWerkstattwahl===false aus -> keine freie Vermittlung.
  it('Kasko + werkstattgebunden -> weder Gutachter noch Werkstatt-Vermittlung', () => {
    const w = resolveFlowWeichen({
      ...basis,
      schuldfrage: 'eigenverantwortung',
      ueberEigeneVersicherung: true,
      freieWerkstattwahl: false,
    })
    expect(w.abrechnungsweg).toBe('kasko')
    expect(w.brauchtGutachter).toBe(false)
    expect(w.brauchtWerkstatt).toBe(false)
  })

  it('nur_gutachter ist eine Haftpflicht-Variante -> Gutachter ja, KEINE Werkstatt', () => {
    const w = resolveFlowWeichen({ ...basis, schuldfrage: 'gegner', serviceTyp: 'nur_gutachter' })
    expect(w.brauchtGutachter).toBe(true)
    expect(w.brauchtWerkstatt).toBe(false)
  })

  it('Anzeige-Regel: SV-Termin vorhanden -> kein Gutachter-Finder mehr', () => {
    const w = resolveFlowWeichen({ ...basis, schuldfrage: 'gegner', hatSvTermin: true })
    expect(w.brauchtGutachter).toBe(false)
  })

  it('Anzeige-Regel: Werkstatt vorhanden -> kein Werkstatt-Finder mehr', () => {
    const w = resolveFlowWeichen({
      ...basis,
      schuldfrage: 'eigenverantwortung',
      ueberEigeneVersicherung: false,
      hatWerkstatt: true,
    })
    expect(w.brauchtWerkstatt).toBe(false)
  })

  it('schuldfrage noch unbekannt (null) -> nichts erzwingen (der Quali-Step entscheidet)', () => {
    expect(resolveFlowWeichen(basis)).toEqual({
      abrechnungsweg: null,
      brauchtGutachter: false,
      brauchtWerkstatt: false,
      brauchtRueckruf: false,
      feststellungZweig: 'unfall',
    })
  })
})
