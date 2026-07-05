import { describe, it, expect } from 'vitest'
import { mapSvRow } from './get-live-svs'

const NOW = 1_000_000_000

// Minimal valid SvRow stub
const BASE_ROW = {
  id: 'sv-1',
  gutachter_typ: 'kfz',
  verifiziert: true,
  paket: 'premium',
  paket_faelle_genutzt: 3,
  paket_faelle_gesamt: 10,
  standort_lat: 52.5,
  standort_lng: 13.4,
  isochrone_polygon: null,
  portal_zugang_freigeschaltet: true,
  gesperrt_seit: null,
  urlaub_von: null,
  urlaub_bis: null,
  live_tracking_enabled: true,
  vorname: 'Max',
  nachname: 'Mustermann',
  avatar_url: null,
  live_lat: null,
  live_lng: null,
  live_updated_at: null,
  live_heading: null,
}

describe('mapSvRow', () => {
  it('car.mode=live wenn frisches GPS vorhanden (< 5min)', () => {
    const row = {
      ...BASE_ROW,
      live_lat: 52.5200,
      live_lng: 13.4050,
      live_heading: 90,
      live_updated_at: new Date(NOW - 60_000).toISOString(), // 1 min ago
    }
    const result = mapSvRow(row, null, NOW)
    expect(result.car.mode).toBe('live')
    expect(result.car.lat).toBe(52.5200)
    expect(result.car.lng).toBe(13.4050)
    expect(result.car.heading).toBe(90)
    expect(result.id).toBe('sv-1')
    expect(result.name).toBe('Max Mustermann')
  })

  it('car.mode=unterwegs_derived wenn kein GPS aber Termin status=unterwegs mit Ziel', () => {
    const termin = {
      id: 't-1',
      assignee_id: 'sv-1',
      assignee_typ: 'sachverstaendiger',
      status: 'unterwegs',
      start_zeit: new Date(NOW).toISOString(),
      losgefahren_am: new Date(NOW - 10_000).toISOString(),
      sv_unterwegs_seit: null,
      sv_eta_minuten: 15,
      besichtigungsort_lat: 50.9,
      besichtigungsort_lng: 6.9,
    }
    const result = mapSvRow(BASE_ROW, termin, NOW)
    expect(result.car.mode).toBe('unterwegs_derived')
    expect(result.car.zielLat).toBe(50.9)
    expect(result.car.zielLng).toBe(6.9)
    expect(result.car.terminId).toBe('t-1')
    expect(result.car.etaMinuten).toBe(15)
  })

  it('car.mode=none wenn kein GPS und kein aktiver Termin', () => {
    const result = mapSvRow(BASE_ROW, null, NOW)
    expect(result.car.mode).toBe('none')
    expect(result.car.lat).toBeNull()
    expect(result.car.terminId).toBeNull()
  })

  it('name faellt auf Unbekannt zurueck wenn vorname+nachname leer', () => {
    const row = { ...BASE_ROW, vorname: null, nachname: null }
    const result = mapSvRow(row as Parameters<typeof mapSvRow>[0], null, NOW)
    expect(result.name).toBe('Unbekannt')
  })

  it('gesperrt=true wenn gesperrt_seit gesetzt', () => {
    const row = { ...BASE_ROW, gesperrt_seit: new Date(NOW - 86400_000).toISOString() }
    const result = mapSvRow(row, null, NOW)
    expect(result.gesperrt).toBe(true)
  })

  it('genutzt/gesamt defaulten auf 0 wenn null', () => {
    const row = { ...BASE_ROW, paket_faelle_genutzt: null, paket_faelle_gesamt: null }
    const result = mapSvRow(row as Parameters<typeof mapSvRow>[0], null, NOW)
    expect(result.genutzt).toBe(0)
    expect(result.gesamt).toBe(0)
  })
})
