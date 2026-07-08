import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mapLeadZuAnlageInput, istBereitsKonvertiert, convertPartnerLead } from '../convert-partner-lead'

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
  lat: null,
  lng: null,
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
  it('mapLeadZuAnlageInput reicht lat/lng durch', () => {
    const inp = mapLeadZuAnlageInput({ ...lead, lat: 51.5, lng: 9.8 } as any)
    expect(inp.lat).toBe(51.5)
    expect(inp.lng).toBe(9.8)
  })
  it('mapLeadZuAnlageInput setzt lat/lng=null wenn nicht vorhanden', () => {
    const inp = mapLeadZuAnlageInput(lead as any)
    expect(inp.lat).toBeNull()
    expect(inp.lng).toBeNull()
  })
})

// Block-Guard-Test: werkstatt-Convert ohne Koordinaten muss blocken
describe('convertPartnerLead Block-Guard', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('blockt werkstatt-Convert ohne lat/lng (ok:false, error enthaelt Adresse)', async () => {
    // Admin-Client mocken: gibt werkstatt-Lead ohne lat/lng zurueck
    vi.mock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'pl-ws-1',
                  rolle: 'werkstatt',
                  firma: 'Test Werkstatt GmbH',
                  ansprechpartner_vorname: 'Max',
                  ansprechpartner_nachname: 'Muster',
                  email: 'ws@test.de',
                  telefon: null,
                  plz: '50667',
                  ort: 'Koeln',
                  lat: null,
                  lng: null,
                  rollen_details: {},
                  konvertiert_zu_user_id: null,
                  konvertiert_zu_partner_id: null,
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }))

    const { convertPartnerLead: convert } = await import('../convert-partner-lead')
    const result = await convert('pl-ws-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Adresse')
    }
  })
})
