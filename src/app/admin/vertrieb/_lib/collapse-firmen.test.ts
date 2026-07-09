import { describe, it, expect } from 'vitest'
import { collapseByFirma } from './collapse-firmen'
import type { VertriebKontakt } from '@/lib/vertrieb/vertrieb-kontakt.types'

const k = (o: Partial<VertriebKontakt>): VertriebKontakt => ({
  id: Math.random().toString(36), kind: 'sv-lead', name: null, email: null, telefon: null,
  plz: null, ort: null, lat: null, lng: null, owner_id: null, quelle: null, erstellt_am: null,
  roh_status: null, roh_ist_aktiv: null, roh_gesperrt: null, roh_verifiziert: null,
  roh_portal_zugang: null, roh_onboarding_offen: null, roh_warteliste: null, notizen: null,
  stufe: 'neu', ...o,
})

describe('collapseByFirma', () => {
  it('fasst Mehr-Standort-Firmen (gleicher kind + Name) zu einer Zeile mit Standort-Zahl zusammen', () => {
    const daten = [
      k({ id: '1', name: 'Steinacker Ingenieurgesellschaft mbH', ort: 'Bonn' }),
      k({ id: '2', name: 'Steinacker Ingenieurgesellschaft mbH', ort: 'Trier' }),
      k({ id: '3', name: 'Steinacker Ingenieurgesellschaft mbH', ort: 'Koblenz' }),
    ]
    const res = collapseByFirma(daten)
    expect(res).toHaveLength(1)
    expect(res[0].standorte).toBe(3)
    expect(res[0].ort).toBe('Bonn') // erste Zeile bleibt Repräsentant
  })

  it('normalisiert Groß-/Kleinschreibung + Whitespace', () => {
    const res = collapseByFirma([
      k({ name: 'Ing.-Büro Urbach KG' }),
      k({ name: '  ing.-büro urbach kg ' }),
    ])
    expect(res).toHaveLength(1)
    expect(res[0].standorte).toBe(2)
  })

  it('gruppiert NICHT über kind hinweg (gleicher Name, anderer Typ = getrennt)', () => {
    const res = collapseByFirma([
      k({ name: 'Muster GmbH', kind: 'sv-lead' }),
      k({ name: 'Muster GmbH', kind: 'werkstatt' }),
    ])
    expect(res).toHaveLength(2)
  })

  it('Zeilen ohne Namen bleiben eigene Einträge (kein Merge)', () => {
    const res = collapseByFirma([k({ id: 'a', name: null }), k({ id: 'b', name: null })])
    expect(res).toHaveLength(2)
    expect(res.every((r) => r.standorte === 1)).toBe(true)
  })

  it('unterschiedliche Firmen bleiben getrennt (standorte=1)', () => {
    const res = collapseByFirma([k({ name: 'A GmbH' }), k({ name: 'B GmbH' })])
    expect(res).toHaveLength(2)
    expect(res.every((r) => r.standorte === 1)).toBe(true)
  })
})
