import { describe, it, expect } from 'vitest'
import { buildWerkstattFinderLeadExtra } from '../embed-finder-core'

const base = { werkstattId: 'w1', werkstattEmail: 'ws@example.invalid', kundeEmail: 'k@example.invalid', schuldfrage: 'eigenverantwortung' as const, eigeneVersicherung: 'ja' as const }
const gebunden = { markeId: 'm1', markeName: 'HUK-COBURG', tarifId: 't1', tarifName: 'Classic SELECT', markerAntwort: null, freieWerkstattwahl: false as const, quelle: 'tarif' as const, grund: 'tarif_mit_wb' as const }
const frei = { ...gebunden, tarifId: 't2', tarifName: 'Classic', freieWerkstattwahl: true as const, grund: 'tarif_ohne_wb' as const }

describe('buildWerkstattFinderLeadExtra — Kasko-Werkstattbindung', () => {
  it('gebunden: Tariffelder + freie_werkstattwahl=false, KEINE Zuweisung, kein reparaturwunsch', () => {
    const extra = buildWerkstattFinderLeadExtra({ ...base, kaskoWb: gebunden })
    expect(extra).toMatchObject({ eigene_versicherung_marke_id: 'm1', eigene_kasko_tarif_name: 'Classic SELECT', freie_werkstattwahl: false, werkstattbindung_quelle: 'tarif' })
    expect(extra.reparatur_werkstatt_id).toBeUndefined()
    expect(extra.reparaturwunsch).toBeUndefined()
  })
  it('frei: Zuweisung wie bisher + freie_werkstattwahl=true', () => {
    const extra = buildWerkstattFinderLeadExtra({ ...base, kaskoWb: frei })
    expect(extra.reparatur_werkstatt_id).toBe('w1')
    expect(extra.freie_werkstattwahl).toBe(true)
  })
  it('unbekannt: Zuweisung erlaubt, freie_werkstattwahl bleibt weg, quelle=unbekannt', () => {
    const extra = buildWerkstattFinderLeadExtra({ ...base, kaskoWb: { ...frei, freieWerkstattwahl: null, quelle: 'unbekannt', grund: 'unbekannt' } })
    expect(extra.reparatur_werkstatt_id).toBe('w1')
    expect(extra.freie_werkstattwahl).toBeUndefined()
    expect(extra.werkstattbindung_quelle).toBe('unbekannt')
  })
})
