import { describe, it, expect } from 'vitest'
import { erfuelltBedingung, matcheSzenario, berechneAktiveSteps, erhebtNoch } from '../flow-szenarien'
// Die echte Matrix (Spiegel des DB-Seeds). Zur Laufzeit kommen die Daten aus flow_szenarien +
// flow_szenario_steps; die Fixture haelt die LOGIK testbar — das war die Bedingung fuer den DB-Umbau.
import { SZENARIEN_FIXTURE as SZENARIEN, STEPS_FIXTURE as STEPS } from './flow-config-fixture'

describe('erfuelltBedingung', () => {
  it('null-Bedingung -> immer sichtbar', () => {
    expect(erfuelltBedingung(null, {})).toBe(true)
  })

  it('{feld: null} -> nur wenn das Feld LEER ist', () => {
    expect(erfuelltBedingung({ sv_id: null }, { sv_id: null })).toBe(true)
    expect(erfuelltBedingung({ sv_id: null }, {})).toBe(true)
    expect(erfuelltBedingung({ sv_id: null }, { sv_id: '' })).toBe(true)
    expect(erfuelltBedingung({ sv_id: null }, { sv_id: 'sv-1' })).toBe(false)
  })

  it('{feld: "$gesetzt"} -> nur wenn das Feld GESETZT ist', () => {
    expect(erfuelltBedingung({ sv_id: '$gesetzt' }, { sv_id: 'sv-1' })).toBe(true)
    expect(erfuelltBedingung({ sv_id: '$gesetzt' }, { sv_id: null })).toBe(false)
  })

  it('{feld: "wert"} -> Gleichheit', () => {
    expect(erfuelltBedingung({ schuldfrage: 'gegner' }, { schuldfrage: 'gegner' })).toBe(true)
    expect(erfuelltBedingung({ schuldfrage: 'gegner' }, { schuldfrage: 'unklar' })).toBe(false)
  })

  it('{feld: [a,b]} -> einer der Werte', () => {
    expect(erfuelltBedingung({ schuldfrage: ['gegner', 'unklar'] }, { schuldfrage: 'unklar' })).toBe(true)
    expect(erfuelltBedingung({ schuldfrage: ['gegner', 'unklar'] }, { schuldfrage: 'eigenverantwortung' })).toBe(false)
  })

  it('mehrere Keys -> UND', () => {
    const b = { sv_id: null, schuldfrage: 'gegner' }
    expect(erfuelltBedingung(b, { sv_id: null, schuldfrage: 'gegner' })).toBe(true)
    expect(erfuelltBedingung(b, { sv_id: 'sv-1', schuldfrage: 'gegner' })).toBe(false)
  })

  it('false ist ein WERT, kein Leerwert (freie_werkstattwahl=false darf nicht als "leer" gelten)', () => {
    expect(erfuelltBedingung({ freie_werkstattwahl: null }, { freie_werkstattwahl: false })).toBe(false)
    expect(erfuelltBedingung({ freie_werkstattwahl: false }, { freie_werkstattwahl: false })).toBe(true)
  })
})

describe('matcheSzenario', () => {
  it('gegner -> haftpflicht', () => {
    expect(matcheSzenario(SZENARIEN, { schuldfrage: 'gegner', service_typ: 'komplett' })?.id).toBe('haftpflicht')
  })

  it('gegner + nur_gutachter -> das SPEZIFISCHERE Szenario gewinnt (Prioritaet)', () => {
    expect(
      matcheSzenario(SZENARIEN, { schuldfrage: 'gegner', service_typ: 'nur_gutachter' })?.id,
    ).toBe('nur_gutachter')
  })

  it('unklar -> teilschuld', () => {
    expect(matcheSzenario(SZENARIEN, { schuldfrage: 'unklar' })?.id).toBe('teilschuld')
  })

  it('eigenverantwortung + ja -> kasko', () => {
    expect(
      matcheSzenario(SZENARIEN, { schuldfrage: 'eigenverantwortung', eigene_versicherung: 'ja' })?.id,
    ).toBe('kasko')
  })

  it('eigenverantwortung + nein -> selbstzahler', () => {
    expect(
      matcheSzenario(SZENARIEN, { schuldfrage: 'eigenverantwortung', eigene_versicherung: 'nein' })?.id,
    ).toBe('selbstzahler')
  })

  // Die "scharfe Kante": eigenverantwortung OHNE Versicherungsfrage -> kein spezifisches Szenario.
  // Faellt auf 'unqualifiziert' zurueck -> der Quali-Step holt die Frage nach (statt den Lead still zu toeten).
  it('eigenverantwortung ohne Versicherungsfrage -> unqualifiziert (Quali holt nach)', () => {
    expect(
      matcheSzenario(SZENARIEN, { schuldfrage: 'eigenverantwortung', eigene_versicherung: null })?.id,
    ).toBe('unqualifiziert')
  })

  it('schuldfrage offen -> unqualifiziert', () => {
    expect(matcheSzenario(SZENARIEN, { schuldfrage: null })?.id).toBe('unqualifiziert')
  })
})

describe('berechneAktiveSteps', () => {
  it('Haftpflicht ohne alles -> volle Sequenz inkl. beider Ort-Abfragen', () => {
    const steps = berechneAktiveSteps(STEPS, 'haftpflicht', {
      unfallhergang: null, besichtigungsort_effektiv: null, sv_id: null,
      fahrzeug_standort_effektiv: null, reparatur_werkstatt_id: null,
    })
    expect(steps).toEqual([
      'zusammenfassung', 'feststellung', 'ort_besichtigung', 'termin', 'gutachter',
      'ort_fahrzeug', 'werkstatt', 'sa', 'account',
    ])
  })

  // Anzeige-Regel: SV zugeordnet -> kein Termin-Step. Orte bekannt -> keine Ort-Abfragen.
  it('Haftpflicht mit SV + bekannten Orten -> Termin und Ort-Steps fallen weg, Gutachter bleibt', () => {
    const steps = berechneAktiveSteps(STEPS, 'haftpflicht', {
      unfallhergang: 'Auffahrunfall', besichtigungsort_effektiv: 'Koeln', sv_id: 'sv-1',
      fahrzeug_standort_effektiv: 'Koeln', reparatur_werkstatt_id: null,
    })
    expect(steps).not.toContain('termin')
    expect(steps).not.toContain('ort_besichtigung')
    expect(steps).not.toContain('ort_fahrzeug')
    expect(steps).not.toContain('feststellung')
    expect(steps).toContain('gutachter') // der zugeordnete SV wird ANGEZEIGT
    expect(steps).toContain('werkstatt') // noch keine Werkstatt -> Finder
  })

  it('Werkstatt schon zugeordnet -> Werkstatt-Step faellt weg', () => {
    // hat_vorschaeden=false = beantwortet (false ist ein WERT, kein Leerwert) -> Feststellung skipped.
    const steps = berechneAktiveSteps(STEPS, 'kasko', {
      hat_vorschaeden: false, fahrzeug_standort_effektiv: 'Koeln',
      reparatur_werkstatt_id: 'w-1',
    })
    expect(steps).toEqual(['zusammenfassung', 'account'])
  })

  // Mig 20260716155354: beschreibung kommt seit Werkstatt-Embed Phase 3 (#4412) schon aus dem Embed —
  // sie darf die Feststellung NICHT skippen (Kennzeichen/ZB1/Halter/Vorschaeden kommen ERST dort, Spec §3).
  it('REGRESSION: Embed-beschreibung skippt die Feststellung NICHT (Marker = hat_vorschaeden)', () => {
    const steps = berechneAktiveSteps(STEPS, 'kasko', {
      fahrzeugschaden_beschreibung: 'Kratzer im Lack (aus dem Embed)',
      fahrzeug_standort_effektiv: 'Koeln', reparatur_werkstatt_id: 'w-1',
    })
    expect(steps).toContain('feststellung')
  })

  // DER Kern-Bug (Aarons "loses Ende"): Kasko sieht NIE einen Termin-/Gutachter-Step.
  it('REGRESSION: Kasko hat weder termin noch gutachter — dafuer Werkstatt + Fahrzeugort', () => {
    const steps = berechneAktiveSteps(STEPS, 'kasko', {
      fahrzeugschaden_beschreibung: null, fahrzeug_standort_effektiv: null, reparatur_werkstatt_id: null,
    })
    expect(steps).not.toContain('termin')
    expect(steps).not.toContain('gutachter')
    expect(steps).not.toContain('sa')
    expect(steps).toEqual(['zusammenfassung', 'feststellung', 'ort_fahrzeug', 'werkstatt', 'account'])
  })

  it('Teilschuld -> nur Zusammenfassung + Rueckruf', () => {
    expect(berechneAktiveSteps(STEPS, 'teilschuld', {})).toEqual(['zusammenfassung', 'rueckruf'])
  })

  it('inaktive Steps werden ignoriert', () => {
    const mitInaktiv = [
      ...STEPS,
      { szenario_id: 'teilschuld', step_id: 'experiment', reihenfolge: 3, bedingung: null, aktiv: false },
    ]
    expect(berechneAktiveSteps(mitInaktiv, 'teilschuld', {})).toEqual(['zusammenfassung', 'rueckruf'])
  })

  it('unbekanntes Szenario -> leer (kein Absturz)', () => {
    expect(berechneAktiveSteps(STEPS, 'gibt-es-nicht', {})).toEqual([])
  })
})

describe('erhebtNoch (erhebt_felder — Erhebungs-Vollstaendigkeit)', () => {
  it('leere/fehlende Liste -> kein Gate (Step bleibt sichtbar)', () => {
    expect(erhebtNoch(null, {})).toBe(true)
    expect(erhebtNoch([], { kennzeichen: 'B-XY-123' })).toBe(true)
  })
  it('sichtbar solange >=1 Feld leer', () => {
    expect(erhebtNoch(['kennzeichen', 'unfallhergang'], { kennzeichen: 'B-XY-123', unfallhergang: null })).toBe(true)
    expect(erhebtNoch(['kennzeichen'], { kennzeichen: '' })).toBe(true)
  })
  it('unsichtbar wenn ALLE gelisteten Felder gefuellt', () => {
    expect(erhebtNoch(['kennzeichen', 'unfallhergang'], { kennzeichen: 'B-XY-123', unfallhergang: 'Auffahrunfall' })).toBe(false)
  })
  it('false ist ein WERT, kein Leerwert (hat_vorschaeden=false zaehlt als erhoben)', () => {
    expect(erhebtNoch(['hat_vorschaeden'], { hat_vorschaeden: false })).toBe(false)
  })
})
