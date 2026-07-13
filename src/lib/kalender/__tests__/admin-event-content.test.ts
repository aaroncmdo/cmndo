import { describe, it, expect } from 'vitest'
import { formatAdminEventContent, type AdminEventInput } from '../admin-event-content'

const BASE: AdminEventInput = {
  typ: 'rueckruf',
  titel: 'Rückruf',
  beschreibung: null,
  notizen: null,
  lead_id: null,
  fall_id: null,
  start_zeit: '2026-07-10T08:00:00.000Z',
  end_zeit: null,
}

describe('formatAdminEventContent', () => {
  it('Titel + Kunde/Telefon aus Lead', () => {
    const c = formatAdminEventContent(BASE, { vorname: 'Max', nachname: 'M', telefon: '0151' })
    expect(c.title).toContain('Claimondo · Rückruf')
    expect(c.description).toContain('Kunde: Max M')
    expect(c.description).toContain('Telefon: 0151')
  })
  it('end-Fallback +15min wenn kein end_zeit', () => {
    const c = formatAdminEventContent(BASE, null)
    expect(c.startIso).toBe('2026-07-10T08:00:00.000Z')
    expect(c.endIso).toBe('2026-07-10T08:15:00.000Z')
  })
  it('unbekannter typ → roher typ-Wert im Titel', () => {
    const c = formatAdminEventContent({ ...BASE, typ: 'sonstiges', titel: 'X' }, null)
    expect(c.title).toContain('Claimondo · sonstiges')
  })
})
