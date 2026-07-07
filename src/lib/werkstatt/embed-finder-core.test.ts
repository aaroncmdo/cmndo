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
})
