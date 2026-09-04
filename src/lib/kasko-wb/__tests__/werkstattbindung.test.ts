// src/lib/kasko-wb/__tests__/werkstattbindung.test.ts
import { describe, it, expect } from 'vitest'
import { leiteWerkstattbindungAb } from '../werkstattbindung'

const frei = { hatWerkstattbindung: false, bindungsumfang: 'keine' as const }
const gebunden = { hatWerkstattbindung: true, bindungsumfang: 'voll' as const }
const nurGlas = { hatWerkstattbindung: true, bindungsumfang: 'nur_glas' as const }

describe('leiteWerkstattbindungAb', () => {
  it('Marke ohne WB-Angebot (LVM) -> frei, unabhaengig vom Rest', () => {
    expect(leiteWerkstattbindungAb({ wbStatus: 'keine', tarif: null, markerAntwort: 'ja', schadenIstGlas: false }))
      .toEqual({ freieWerkstattwahl: true, quelle: 'tarif', grund: 'keine_wb_bei_marke' })
  })
  it('Marke mit Standard-WB (Volkswagen) -> gebunden', () => {
    expect(leiteWerkstattbindungAb({ wbStatus: 'standard', tarif: null, markerAntwort: null, schadenIstGlas: false }))
      .toEqual({ freieWerkstattwahl: false, quelle: 'tarif', grund: 'standard_wb' })
  })
  it('Tarif ohne WB -> frei; Tarif mit WB -> gebunden', () => {
    expect(leiteWerkstattbindungAb({ wbStatus: 'optional', tarif: frei, markerAntwort: null, schadenIstGlas: false }).freieWerkstattwahl).toBe(true)
    const g = leiteWerkstattbindungAb({ wbStatus: 'optional', tarif: gebunden, markerAntwort: null, schadenIstGlas: false })
    expect(g).toEqual({ freieWerkstattwahl: false, quelle: 'tarif', grund: 'tarif_mit_wb' })
  })
  it('E7: nur_glas bei Karosserieschaden -> frei mit Grund; bei Glasschaden -> gebunden', () => {
    expect(leiteWerkstattbindungAb({ wbStatus: 'optional', tarif: nurGlas, markerAntwort: null, schadenIstGlas: false }))
      .toEqual({ freieWerkstattwahl: true, quelle: 'tarif', grund: 'nur_glas_karosserie' })
    expect(leiteWerkstattbindungAb({ wbStatus: 'optional', tarif: nurGlas, markerAntwort: null, schadenIstGlas: true }).freieWerkstattwahl).toBe(false)
  })
  it('Tarif schlaegt Marker-Antwort', () => {
    expect(leiteWerkstattbindungAb({ wbStatus: 'optional', tarif: frei, markerAntwort: 'ja', schadenIstGlas: false }).freieWerkstattwahl).toBe(true)
  })
  it('ohne Tarif entscheidet die Marker-Antwort', () => {
    expect(leiteWerkstattbindungAb({ wbStatus: 'optional', tarif: null, markerAntwort: 'ja', schadenIstGlas: false }))
      .toEqual({ freieWerkstattwahl: false, quelle: 'marker', grund: 'marker_bestaetigt' })
    expect(leiteWerkstattbindungAb({ wbStatus: null, tarif: null, markerAntwort: 'nein', schadenIstGlas: false }))
      .toEqual({ freieWerkstattwahl: true, quelle: 'marker', grund: 'marker_verneint' })
  })
  it('E3: keine Antwort -> null / unbekannt', () => {
    expect(leiteWerkstattbindungAb({ wbStatus: 'optional', tarif: null, markerAntwort: 'unbekannt', schadenIstGlas: false }))
      .toEqual({ freieWerkstattwahl: null, quelle: 'unbekannt', grund: 'unbekannt' })
    expect(leiteWerkstattbindungAb({ wbStatus: null, tarif: null, markerAntwort: null, schadenIstGlas: false }).freieWerkstattwahl).toBeNull()
  })
})
