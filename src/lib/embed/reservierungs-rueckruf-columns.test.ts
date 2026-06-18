import { describe, it, expect } from 'vitest'
import { buildReservierungsRueckruf } from './reservierungs-rueckruf-columns'

const base = {
  leadId: 'lead-1',
  dispId: 'disp-1',
  name: 'Max Mustermann',
  startIso: '2026-06-18T08:00:00.000Z',
}

describe('buildReservierungsRueckruf', () => {
  it('gemeinsame Spalten: typ/status/lead/dispatcher/erinnerung', () => {
    const c = buildReservierungsRueckruf({ ...base, vonKunde: false })
    expect(c.typ).toBe('rueckruf')
    expect(c.status).toBe('offen')
    expect(c.lead_id).toBe('lead-1')
    expect(c.erstellt_von).toBe('disp-1')
    expect(c.zugewiesen_an).toBe('disp-1')
    expect(c.erinnerung_min_vorher).toBe(10)
  })

  it('end_zeit = start + 30 min', () => {
    const c = buildReservierungsRueckruf({ ...base, vonKunde: false })
    expect(c.start_zeit).toBe('2026-06-18T08:00:00.000Z')
    expect(c.end_zeit).toBe('2026-06-18T08:30:00.000Z')
  })

  it('auto (vonKunde=false): Rückruf-Titel + Automatik-Beschreibung', () => {
    const c = buildReservierungsRueckruf({ ...base, vonKunde: false })
    expect(c.titel).toBe('Rückruf: Max Mustermann')
    expect(c.beschreibung).toContain('Automatischer Rückruf')
    expect(c.beschreibung).toContain('Quelle: embed-gutachter-finder')
  })

  it('vonKunde=true: Beratungsgespräch-Titel + Kunden-Wunschzeit-Beschreibung', () => {
    const c = buildReservierungsRueckruf({ ...base, vonKunde: true })
    expect(c.titel).toBe('Beratungsgespräch: Max Mustermann')
    expect(c.beschreibung).toContain('Wunschzeit vom Kunden')
    expect(c.beschreibung).toContain('Quelle: embed-gutachter-finder')
  })
})
