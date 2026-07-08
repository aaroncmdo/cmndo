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
  strasse: null,
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

// Koordinaten-Guard (werkstatt): on-demand-Geocode-Fallback statt harter Sackgasse.
// Bestandsleads ohne Intake-Geocode (lat/lng=null) werden beim Convert nachgeocodet;
// nur ein echt fehlschlagender Geocode blockt. vi.doMock (nicht gehoistet) je Test.
describe('convertPartnerLead Koordinaten-Guard (werkstatt, on-demand-Geocode)', () => {
  const werkstattOhneKoord = {
    id: 'pl-ws-1', rolle: 'werkstatt', firma: 'Test Werkstatt GmbH',
    ansprechpartner_vorname: 'Max', ansprechpartner_nachname: 'Muster', email: 'ws@test.de',
    telefon: null, plz: '50667', ort: 'Koeln', strasse: 'Domkloster 4',
    lat: null, lng: null, rollen_details: {},
    konvertiert_zu_user_id: null, konvertiert_zu_partner_id: null,
  }
  const mockAdmin = () => ({
    createAdminClient: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: werkstattOhneKoord, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    }),
  })
  const anlageStub = () => ({ anlegePartnerKern: async () => ({ ok: false, error: 'ANLAGE_STUB' }) })

  beforeEach(() => {
    vi.resetModules()
  })

  it('blockt, wenn der on-demand-Geocode fehlschlaegt (unfixbare Adresse)', async () => {
    vi.doMock('@/lib/supabase/admin', mockAdmin)
    vi.doMock('@/lib/partner/anlege-partner', anlageStub)
    vi.doMock('@/lib/partner/geocode-partner-lead', () => ({
      geocodePartnerLead: async () => ({ ok: false, error: 'x', unvollstaendig: false }),
    }))
    const { convertPartnerLead: convert } = await import('../convert-partner-lead')
    const result = await convert('pl-ws-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Adresse')
  })

  it('holt Koordinaten on-demand nach → Guard passiert (Bestandslead wird konvertierbar)', async () => {
    vi.doMock('@/lib/supabase/admin', mockAdmin)
    vi.doMock('@/lib/partner/anlege-partner', anlageStub)
    vi.doMock('@/lib/partner/geocode-partner-lead', () => ({
      geocodePartnerLead: async () => ({ ok: true, lat: 50.94, lng: 6.96, place_id: 'mb-1', formatted: 'Domkloster 4, 50667 Köln' }),
    }))
    const { convertPartnerLead: convert } = await import('../convert-partner-lead')
    const result = await convert('pl-ws-1')
    // anlegePartnerKern-Stub liefert den Fehler → beweist, dass der Koordinaten-Block PASSIERT wurde.
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('ANLAGE_STUB')
      expect(result.error).not.toContain('Adresse')
    }
  })
})
