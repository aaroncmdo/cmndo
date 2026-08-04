import { describe, it, expect } from 'vitest'
import { darfWerkstattZuweisen, buildWerkstattFinderLeadExtra } from './embed-finder-core'

describe('darfWerkstattZuweisen', () => {
  it('erlaubt echt+echt', () => {
    expect(darfWerkstattZuweisen('kunde@web.de', 'info@schneider-ruhl.de')).toBe(true)
  })
  it('erlaubt test+test', () => {
    expect(darfWerkstattZuweisen('test-kunde@claimondo.de', 'werkstatt-smoke@claimondo.de')).toBe(true)
  })
  it('blockt echt-Kunde + Test-Werkstatt', () => {
    expect(darfWerkstattZuweisen('kunde@web.de', 'werkstatt-smoke@claimondo.de')).toBe(false)
  })
  it('blockt Test-Kunde + echte Werkstatt', () => {
    expect(darfWerkstattZuweisen('e2e@claimondo.de', 'info@schneider-ruhl.de')).toBe(false)
  })
})

describe('buildWerkstattFinderLeadExtra', () => {
  it('weist Reparateur zu (quelle=embed) wenn Guard passt', () => {
    const extra = buildWerkstattFinderLeadExtra({
      werkstattId: 'ws-1', werkstattEmail: 'info@schneider-ruhl.de',
      kundeEmail: 'kunde@web.de', lat: 51.2, lng: 6.7, ort: 'Ratingen',
    })
    expect(extra.reparatur_werkstatt_id).toBe('ws-1')
    expect(extra.reparatur_werkstatt_quelle).toBe('embed')
    expect(extra.reparatur_vermittlung_status).toBe('vermittelt')
    expect(extra.reparaturwunsch).toBe('reparatur')
    expect(extra.fahrzeug_standort_lat).toBe(51.2)
    expect(extra.fahrzeug_standort_lng).toBe(6.7)
  })
  it('Supply-Gate: kein werkstattId -> keine Werkstatt-Felder, nur Geo', () => {
    const extra = buildWerkstattFinderLeadExtra({
      werkstattId: null, werkstattEmail: null, kundeEmail: 'kunde@web.de', lat: 52.5, lng: 13.4, ort: 'Berlin',
    })
    expect(extra.reparatur_werkstatt_id).toBeUndefined()
    expect(extra.reparaturwunsch).toBeUndefined()
    expect(extra.fahrzeug_standort_lat).toBe(52.5)
  })
  it('Guard-Block: echt-Kunde + Test-Werkstatt -> keine Werkstatt-Felder', () => {
    const extra = buildWerkstattFinderLeadExtra({
      werkstattId: 'ws-test', werkstattEmail: 'werkstatt-smoke@claimondo.de',
      kundeEmail: 'kunde@web.de', lat: 51, lng: 7, ort: 'Koeln',
    })
    expect(extra.reparatur_werkstatt_id).toBeUndefined()
  })

  // Phase 3: Contract-Felder (fließen via convert-lead-to-claim in Claim/Feststellung/Firma)
  it('schreibt hersteller/klasse/modell/gewerbe/beschreibung + Standort in den extra', () => {
    const e = buildWerkstattFinderLeadExtra({
      werkstattId: null,
      werkstattEmail: null,
      kundeEmail: 'a@b.de',
      lat: 50.9,
      lng: 6.9,
      ort: 'Köln',
      hersteller: 'BMW',
      fahrzeugklasse: 'M1',
      gewerbe: true,
      modell: '3er',
      beschreibung: 'Kratzer im Lack',
    })
    expect(e.fahrzeug_hersteller).toBe('BMW')
    expect(e.fahrzeugklasse).toBe('M1')
    expect(e.fahrzeug_modell).toBe('3er')
    expect(e.gewerbe_flag).toBe(true)
    expect(e.fahrzeugschaden_beschreibung).toBe('Kratzer im Lack')
    expect(e.fahrzeug_standort_adresse).toBe('Köln')
  })
  it('Phase 3: leere/fehlende Strings -> null; gewerbe default false', () => {
    const e = buildWerkstattFinderLeadExtra({
      werkstattId: null,
      werkstattEmail: null,
      kundeEmail: 'a@b.de',
      hersteller: '   ',
      modell: '',
    })
    expect(e.fahrzeug_hersteller).toBeNull()
    expect(e.fahrzeug_modell).toBeNull()
    expect(e.fahrzeugschaden_beschreibung).toBeNull()
    expect(e.gewerbe_flag).toBe(false)
  })
  // Unverschuldet-Option (Aaron 04.08.): schuldfrage-Wahl -> Lead-Felder.
  it('gegner (unverschuldet) -> nur schuldfrage=gegner, KEINE eigene_versicherung (haftpflicht-Szenario)', () => {
    const e = buildWerkstattFinderLeadExtra({
      werkstattId: null, werkstattEmail: null, kundeEmail: 'a@b.de',
      schuldfrage: 'gegner', eigeneVersicherung: null,
    })
    expect(e.schuldfrage).toBe('gegner')
    expect(e.eigene_versicherung).toBeUndefined()
  })
  it('eigenverantwortung + eigeneVersicherung -> beide gesetzt (kasko/selbstzahler)', () => {
    const e = buildWerkstattFinderLeadExtra({
      werkstattId: null, werkstattEmail: null, kundeEmail: 'a@b.de',
      schuldfrage: 'eigenverantwortung', eigeneVersicherung: 'ja',
    })
    expect(e.schuldfrage).toBe('eigenverantwortung')
    expect(e.eigene_versicherung).toBe('ja')
  })
  it('eigenverantwortung OHNE eigeneVersicherung -> nichts gesetzt (sonst still-disqualifiziert)', () => {
    const e = buildWerkstattFinderLeadExtra({
      werkstattId: null, werkstattEmail: null, kundeEmail: 'a@b.de',
      schuldfrage: 'eigenverantwortung', eigeneVersicherung: null,
    })
    expect(e.schuldfrage).toBeUndefined()
    expect(e.eigene_versicherung).toBeUndefined()
  })
})
