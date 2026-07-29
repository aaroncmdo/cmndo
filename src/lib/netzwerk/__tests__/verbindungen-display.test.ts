import { describe, it, expect } from 'vitest'
import { bauePartnerAnzeige } from '../verbindungen-display'

describe('bauePartnerAnzeige — Namens-Prioritaet', () => {
  const p = {
    id: 'p1',
    rolle: 'werkstatt',
    anzeigename: null,
    vorname: 'Max',
    nachname: 'Muster',
    firma: null,
    ort: 'Köln',
  }
  it('Werkstatt-Name gewinnt vor Profil-Namen', () => {
    const a = bauePartnerAnzeige(p, null, { name: 'Auto Meier GmbH', adresse_ort: 'Köln' })
    expect(a).toEqual({ profilId: 'p1', rolle: 'werkstatt', name: 'Auto Meier GmbH', ort: 'Köln' })
  })
  it('SV firmenname gewinnt vor Profil-Namen', () => {
    const sv = { firmenname: 'KFZ-Gutachter Nord' }
    const a = bauePartnerAnzeige({ ...p, rolle: 'sachverstaendiger' }, sv, null)
    expect(a.name).toBe('KFZ-Gutachter Nord')
  })
  it('Fallback auf vorname+nachname wenn keine Entity/anzeigename', () => {
    const a = bauePartnerAnzeige(p, null, null)
    expect(a.name).toBe('Max Muster')
  })
})
