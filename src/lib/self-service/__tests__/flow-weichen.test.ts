import { describe, it, expect } from 'vitest'
import { resolveFlowWeichen } from '../flow-weichen'
import { SZENARIEN_FIXTURE, STEPS_FIXTURE } from './flow-config-fixture'

// Integrations-Test: gegeben die ECHTE Matrix (DB-Config), verhaelt sich die Weiche so, wie Aaron
// es am 14.07. festgelegt hat. Die Logik selbst ist in flow-szenarien.test.ts geprueft.
const weichen = (kontext: Record<string, unknown>) =>
  resolveFlowWeichen(SZENARIEN_FIXTURE, STEPS_FIXTURE, kontext)

describe('resolveFlowWeichen (DB-Config)', () => {
  it('gegner -> Haftpflicht: Gutachter ja, Werkstatt ja, kein Rueckruf, Feststellung unfall', () => {
    const w = weichen({ schuldfrage: 'gegner', service_typ: 'komplett' })
    expect(w.szenarioId).toBe('haftpflicht')
    expect(w.abrechnungsweg).toBe('haftpflicht')
    expect(w.brauchtGutachter).toBe(true)
    expect(w.brauchtWerkstatt).toBe(true)
    expect(w.brauchtRueckruf).toBe(false)
    expect(w.feststellungZweig).toBe('unfall')
  })

  it('unklar (Teilschuld) -> NUR Rueckruf, kein Gutachter, keine Werkstatt', () => {
    const w = weichen({ schuldfrage: 'unklar' })
    expect(w.szenarioId).toBe('teilschuld')
    expect(w.brauchtRueckruf).toBe(true)
    expect(w.brauchtGutachter).toBe(false)
    expect(w.brauchtWerkstatt).toBe(false)
    expect(w.steps).toEqual(['zusammenfassung', 'rueckruf'])
  })

  it('eigenverantwortung + Kasko -> KEIN Gutachter, Werkstatt ja, Feststellung schaden', () => {
    const w = weichen({ schuldfrage: 'eigenverantwortung', eigene_versicherung: 'ja' })
    expect(w.szenarioId).toBe('kasko')
    expect(w.abrechnungsweg).toBe('kasko')
    expect(w.brauchtGutachter).toBe(false)
    expect(w.brauchtWerkstatt).toBe(true)
    expect(w.feststellungZweig).toBe('schaden')
  })

  it('eigenverantwortung ohne Kasko -> Selbstzahler, KEIN Gutachter, Werkstatt ja', () => {
    const w = weichen({ schuldfrage: 'eigenverantwortung', eigene_versicherung: 'nein' })
    expect(w.szenarioId).toBe('selbstzahler')
    expect(w.abrechnungsweg).toBe('selbstzahler')
    expect(w.brauchtGutachter).toBe(false)
    expect(w.brauchtWerkstatt).toBe(true)
    expect(w.feststellungZweig).toBe('schaden')
  })

  // Aarons "loses Ende" (14.07.): der Lead kommt mit SCHON GESETZTER schuldfrage rein (egal welche
  // Tuer), der Quali-Step entfaellt -> der Selbstzahler-Short-Circuit greift nicht. Vorher war
  // needsBooking rein terminzustands-gegatet -> der Gutachter-Finder erschien faelschlich.
  it('REGRESSION loses Ende: Kasko-Lead ohne Termin, ohne Quali-Step -> KEIN Gutachter, ABER Werkstatt', () => {
    const w = weichen({
      schuldfrage: 'eigenverantwortung', eigene_versicherung: 'ja',
      sv_id: null, reparatur_werkstatt_id: null,
    })
    expect(w.brauchtGutachter).toBe(false)
    expect(w.brauchtWerkstatt).toBe(true)
    expect(w.steps).not.toContain('termin')
    expect(w.steps).not.toContain('gutachter')
  })

  it('nur_gutachter ist eine Haftpflicht-Variante -> Gutachter ja, KEINE Werkstatt', () => {
    const w = weichen({ schuldfrage: 'gegner', service_typ: 'nur_gutachter' })
    expect(w.szenarioId).toBe('nur_gutachter')
    expect(w.brauchtGutachter).toBe(true)
    expect(w.brauchtWerkstatt).toBe(false)
  })

  it('Anzeige-Regel: SV zugeordnet -> kein Termin-Step, aber der Gutachter wird ANGEZEIGT', () => {
    const w = weichen({ schuldfrage: 'gegner', sv_id: 'sv-1' })
    expect(w.brauchtGutachter).toBe(false)
    expect(w.steps).not.toContain('termin')
    expect(w.steps).toContain('gutachter')
  })

  it('Anzeige-Regel: Werkstatt zugeordnet -> kein Werkstatt-Step', () => {
    const w = weichen({
      schuldfrage: 'eigenverantwortung', eigene_versicherung: 'nein', reparatur_werkstatt_id: 'w-1',
    })
    expect(w.brauchtWerkstatt).toBe(false)
    expect(w.steps).not.toContain('werkstatt')
  })

  // Die "scharfe Kante": eigenverantwortung OHNE Versicherungsfrage wuerde den Lead still toeten.
  // Die Weiche faellt auf 'unqualifiziert' zurueck -> der Quali-Step holt die Frage nach.
  it('eigenverantwortung, Versicherungsfrage offen -> unqualifiziert + Quali-Step (holt die Kasko-Frage nach)', () => {
    // quali_offen wird in page.tsx abgeleitet: schuldfrage fehlt ODER eigenverantwortung ohne VS-Antwort.
    const w = weichen({ schuldfrage: 'eigenverantwortung', eigene_versicherung: null, quali_offen: true })
    expect(w.szenarioId).toBe('unqualifiziert')
    expect(w.steps).toContain('quali')
    expect(w.brauchtGutachter).toBe(false)
    expect(w.brauchtWerkstatt).toBe(false)
  })

  it('schuldfrage offen -> unqualifiziert, nichts wird erzwungen', () => {
    const w = weichen({ schuldfrage: null, quali_offen: true })
    expect(w.szenarioId).toBe('unqualifiziert')
    expect(w.steps).toEqual(['zusammenfassung', 'quali'])
  })

  // Die zwei VERSCHIEDENEN Orte (Aaron 14.07.): Fahrzeugstandort = Anker fuer den Werkstatt-Finder,
  // Besichtigungsort = Anker fuer den Gutachter-Finder. Jeder wird nur abgefragt, wenn unbekannt.
  it('Ort-Abfragen: nur wenn der jeweilige Ort unbekannt ist', () => {
    const ohneOrte = weichen({ schuldfrage: 'gegner' })
    expect(ohneOrte.steps).toContain('ort_besichtigung')
    expect(ohneOrte.steps).toContain('ort_fahrzeug')

    const mitOrten = weichen({
      schuldfrage: 'gegner', besichtigungsort_effektiv: 'Koeln', fahrzeug_standort_effektiv: 'Bonn',
    })
    expect(mitOrten.steps).not.toContain('ort_besichtigung')
    expect(mitOrten.steps).not.toContain('ort_fahrzeug')
  })

  it('Kasko braucht den Fahrzeugstandort (Werkstatt-Anker), aber KEINEN Besichtigungsort', () => {
    const w = weichen({ schuldfrage: 'eigenverantwortung', eigene_versicherung: 'ja' })
    expect(w.steps).toContain('ort_fahrzeug')
    expect(w.steps).not.toContain('ort_besichtigung')
  })
})
