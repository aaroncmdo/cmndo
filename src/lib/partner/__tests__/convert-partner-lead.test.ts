import { describe, it, expect } from 'vitest'
import { mapLeadZuAnlageInput, istBereitsKonvertiert } from '../convert-partner-lead'

const lead = {
  id: 'pl-1',
  rolle: 'makler',
  firma: 'X GmbH',
  ansprechpartner_vorname: 'A',
  ansprechpartner_nachname: 'B',
  email: 'a@x.de',
  telefon: null,
  plz: null,
  ort: null,
  rollen_details: { ihk: '123' },
  konvertiert_zu_user_id: null,
}

describe('convert-partner-lead', () => {
  it('mappt Lead → Anlage-Input inkl. rollen_details', () => {
    const inp = mapLeadZuAnlageInput(lead as any)
    expect(inp.firma).toBe('X GmbH')
    expect(inp.email).toBe('a@x.de')
    expect(inp.rollenDetails).toEqual({ ihk: '123' })
  })
  it('erkennt bereits konvertierte Leads (Idempotenz)', () => {
    expect(istBereitsKonvertiert({ ...lead, konvertiert_zu_user_id: 'u-1' } as any)).toBe(true)
    expect(istBereitsKonvertiert(lead as any)).toBe(false)
  })
})
