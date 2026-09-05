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

  it('gegner + nur_gutachter -> haftpflicht (nur_gutachter ist KEIN eigenes Szenario mehr)', () => {
    // service_typ steuert nur noch die Kanzlei-Weiche am SA-Ende (Downstream), nicht die Flow-Struktur.
    expect(
      matcheSzenario(SZENARIEN, { schuldfrage: 'gegner', service_typ: 'nur_gutachter' })?.id,
    ).toBe('haftpflicht')
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
  it('Kasko: werkstattbindung_check verschwindet nach Antwort (true, false ODER quelle=unbekannt)', () => {
    const steps = [{ szenario_id: 'kasko', step_id: 'werkstattbindung_check', reihenfolge: 3, bedingung: { freie_werkstattwahl: null, werkstattbindung_quelle: null }, erhebt_felder: [] }]
    const base = { schuldfrage: 'eigenverantwortung', eigene_versicherung: 'ja' }
    expect(berechneAktiveSteps(steps, 'kasko', { ...base, freie_werkstattwahl: null, werkstattbindung_quelle: null })).toEqual(['werkstattbindung_check'])
    expect(berechneAktiveSteps(steps, 'kasko', { ...base, freie_werkstattwahl: true, werkstattbindung_quelle: 'tarif' })).toEqual([])
    expect(berechneAktiveSteps(steps, 'kasko', { ...base, freie_werkstattwahl: null, werkstattbindung_quelle: 'unbekannt' })).toEqual([])
  })

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
  it('Haftpflicht mit SV + vollstaendiger Erhebung -> Termin/Ort/Feststellung fallen weg, Gutachter bleibt', () => {
    const steps = berechneAktiveSteps(STEPS, 'haftpflicht', {
      // alle erhebt_felder gefuellt (Rohspalten!) -> feststellung + Orte fallen weg
      kennzeichen: 'K-1', unfallhergang: 'Auffahrunfall', unfallort: 'Koeln', gegner_versicherung: 'HUK',
      besichtigungsort_adresse: 'Koeln', fahrzeug_standort_adresse: 'Koeln',
      sv_id: 'sv-1', reparatur_werkstatt_id: null,
    })
    expect(steps).not.toContain('termin')
    expect(steps).not.toContain('ort_besichtigung')
    expect(steps).not.toContain('ort_fahrzeug')
    expect(steps).not.toContain('feststellung')
    expect(steps).toContain('gutachter') // der zugeordnete SV wird ANGEZEIGT
    expect(steps).toContain('werkstatt') // noch keine Werkstatt -> Finder
  })

  it('Werkstatt schon zugeordnet -> Picker faellt weg, werkstatt_anzeige erscheint (Symptom 4)', () => {
    // unfallhergang mit im Kontext, damit die Feststellung uebersprungen ist (seit Mig 20260801163119
    // im Gate) und die Liste den Werkstatt-Aspekt isoliert testet.
    const steps = berechneAktiveSteps(STEPS, 'kasko', {
      kennzeichen: 'K-1', schadentyp: 'kollision', unfallhergang: 'x', freie_werkstattwahl: true,
      fahrzeug_standort_adresse: 'Koeln', reparatur_werkstatt_id: 'w-1',
    })
    expect(steps).toEqual(['zusammenfassung', 'werkstatt_anzeige', 'account'])
  })

  // beschreibung kommt seit Werkstatt-Embed Phase 3 (#4412) schon aus dem Embed — sie darf die
  // Feststellung NICHT skippen. Frueher Marker hat_vorschaeden; jetzt gaten erhebt_felder
  // [kennzeichen, schadentyp, unfallhergang] (default-frei), die der Embed NICHT vorbelegt (Spec §3;
  // unfallhergang seit Mig 20260801163119 im Gate — garantiert mind. eine Schaden-Grundlage).
  it('REGRESSION: Embed-beschreibung skippt die Feststellung NICHT (erhebt_felder = kennzeichen/schadentyp/unfallhergang)', () => {
    const steps = berechneAktiveSteps(STEPS, 'kasko', {
      fahrzeugschaden_beschreibung: 'Kratzer im Lack (aus dem Embed)',
      fahrzeug_standort_adresse: 'Koeln', reparatur_werkstatt_id: 'w-1',
    })
    expect(steps).toContain('feststellung')
  })

  // DER Kern-Bug (Aarons "loses Ende"): Kasko sieht NIE einen Termin-/Gutachter-Step.
  it('REGRESSION: Kasko hat weder termin noch gutachter — dafuer Werkstattbindung + Werkstatt + Fahrzeugort', () => {
    const steps = berechneAktiveSteps(STEPS, 'kasko', {})
    expect(steps).not.toContain('termin')
    expect(steps).not.toContain('gutachter')
    expect(steps).not.toContain('sa')
    expect(steps).toEqual(['zusammenfassung', 'feststellung', 'werkstattbindung_check', 'ort_fahrzeug', 'werkstatt', 'account'])
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

describe('erhebt_felder-Regression (Symptome 1/2/4 + Kasko-Gate + nur_gutachter)', () => {
  const kasko = { schuldfrage: 'eigenverantwortung', eigene_versicherung: 'ja' }
  it('Symptom 1: Kasko-Feststellung erscheint trotz hat_vorschaeden=false, solange kennzeichen leer', () => {
    const steps = berechneAktiveSteps(STEPS, 'kasko', { ...kasko, hat_vorschaeden: false, kennzeichen: null, schadentyp: null })
    expect(steps).toContain('feststellung')
  })
  // Mig 20260801163119 (Aaron 01.08.): unfallhergang gehoert ins Gate von Kasko+Selbstzahler, damit
  // mind. eine Schaden-Grundlage garantiert ist. Isoliert das neue Gate-Feld gegen kennzeichen/schadentyp.
  it('unfallhergang im Gate: Feststellung bleibt bei kennzeichen+schadentyp GEFUELLT aber unfallhergang LEER', () => {
    const komplett = { kennzeichen: 'K-1', schadentyp: 'kollision', unfallhergang: 'Beim Ausparken verkratzt.' }
    // nur unfallhergang fehlt -> Feststellung bleibt (das neue Gate-Feld)
    expect(berechneAktiveSteps(STEPS, 'kasko', { ...kasko, kennzeichen: 'K-1', schadentyp: 'kollision' })).toContain('feststellung')
    expect(berechneAktiveSteps(STEPS, 'selbstzahler', { kennzeichen: 'K-1', schadentyp: 'kollision' })).toContain('feststellung')
    // alle drei gefuellt -> Feststellung faellt weg (uebersprungen)
    expect(berechneAktiveSteps(STEPS, 'kasko', { ...kasko, ...komplett })).not.toContain('feststellung')
    expect(berechneAktiveSteps(STEPS, 'selbstzahler', { ...komplett })).not.toContain('feststellung')
  })
  it('Symptom 2: ort_fahrzeug erscheint bei gesetztem unfallort aber leerer Rohspalte', () => {
    const steps = berechneAktiveSteps(STEPS, 'kasko', {
      ...kasko, kennzeichen: 'K-1', schadentyp: 'kollision',
      fahrzeug_standort_adresse: null, fahrzeug_standort_effektiv: 'Koeln',
    })
    expect(steps).toContain('ort_fahrzeug')
  })
  it('Symptom 4: gesetzte Werkstatt -> werkstatt_anzeige sichtbar, werkstatt (Picker) nicht', () => {
    const steps = berechneAktiveSteps(STEPS, 'kasko', {
      ...kasko, kennzeichen: 'K-1', schadentyp: 'kollision',
      fahrzeug_standort_adresse: 'Koeln', reparatur_werkstatt_id: 'w-1', freie_werkstattwahl: true,
    })
    expect(steps).toContain('werkstatt_anzeige')
    expect(steps).not.toContain('werkstatt')
  })
  it('Kasko-Werkstattbindung-Gate: werkstattbindung_check erscheint solange freie_werkstattwahl NULL', () => {
    const steps = berechneAktiveSteps(STEPS, 'kasko', { ...kasko, kennzeichen: 'K-1', schadentyp: 'kollision', fahrzeug_standort_adresse: 'Koeln', freie_werkstattwahl: null })
    expect(steps).toContain('werkstattbindung_check')
  })
  it('Werkstattbindung bestaetigt (frei=true) -> Gate verschwindet', () => {
    const steps = berechneAktiveSteps(STEPS, 'kasko', { ...kasko, kennzeichen: 'K-1', schadentyp: 'kollision', fahrzeug_standort_adresse: 'Koeln', freie_werkstattwahl: true })
    expect(steps).not.toContain('werkstattbindung_check')
  })
  it('Haftpflicht: beide Ort-Steps erscheinen bei leeren Rohspalten (auch mit gesetztem unfallort)', () => {
    const steps = berechneAktiveSteps(STEPS, 'haftpflicht', {
      schuldfrage: 'gegner', kennzeichen: 'K-1', unfallhergang: 'x', unfallort: 'Koeln', gegner_versicherung: 'HUK',
      besichtigungsort_adresse: null, fahrzeug_standort_adresse: null,
    })
    expect(steps).toContain('ort_besichtigung')
    expect(steps).toContain('ort_fahrzeug')
  })
  it('nur_gutachter ist geloescht', () => {
    expect(berechneAktiveSteps(STEPS, 'nur_gutachter', {})).toEqual([])
    expect(SZENARIEN.find((s) => s.id === 'nur_gutachter')).toBeUndefined()
  })
})
